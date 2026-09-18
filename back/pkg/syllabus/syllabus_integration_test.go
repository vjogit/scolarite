package syllabus_test

// Tests d'intégration du domaine syllabus, dans le style du registre : fixture
// partagée SeedStructureFixture, pool réel, routeur monté avec ses gardes de
// rôles, pool et rôles posés dans le contexte comme le feraient
// DatabaseMiddleware et AuthMiddleware.
//
// Ils documentent aussi la règle tranchée au lot 1 : la structure fait
// référence (matiere.heure, 20 h dans la fixture) et le syllabus ne la
// vérifie pas — une ventilation dont la somme diffère s'enregistre.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"cyb-react/pkg/services"
	uegen "cyb-react/pkg/structure/unite_enseignement/gen"
	"cyb-react/pkg/syllabus"
	"cyb-react/pkg/syllabus/gen"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	rolesEcriture = []string{services.RoleConsultation, services.RoleSyllabusEcriture}
	rolesLecture  = []string{services.RoleConsultation}
)

func routeur() chi.Router {
	r := chi.NewRouter()
	r.Route("/syllabus", func(r chi.Router) {
		syllabus.RouteSyllabus(r, convertisseurTest(), "Établissement test", traducteurTest())
	})
	return r
}

func requete(t *testing.T, pool *pgxpool.Pool, roles []string, method, path string, body any) *http.Request {
	t.Helper()
	reader := bytes.NewReader(nil)
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, reader)
	ctx := context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool})
	ctx = context.WithValue(ctx, services.KeycloakRolesCtxKey, roles)
	return req.WithContext(ctx)
}

func appeler(t *testing.T, pool *pgxpool.Pool, roles []string, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	routeur().ServeHTTP(rec, requete(t, pool, roles, method, path, body))
	return rec
}

func decoder[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &v), rec.Body.String())
	return v
}

// probleme lit l'enveloppe RFC 9457 : le code et la map d'erreurs de champ.
type probleme struct {
	Code   string                              `json:"code"`
	Errors map[string]services.ConstraintError `json:"errors"`
}

func f64(v float64) *float64 { return &v }
func str(v string) *string   { return &v }

// creerAgent insère un compte AGENT, la population des responsables.
func creerAgent(t *testing.T, pool *pgxpool.Pool, email string) int32 {
	t.Helper()
	var id int32
	err := pool.QueryRow(context.Background(),
		`INSERT INTO public."user" (version, "firstName", "lastName", email, type_personne)
		 VALUES (1, 'Agent', 'Syllabus', $1, 'AGENT') RETURNING id`, email).Scan(&id)
	require.NoError(t, err)
	return id
}

func TestIntegration_Syllabus_FicheMatiere_Upsert(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "syl1")
	agentID := creerAgent(t, pool, "agent-syl1@test.invalid")
	chemin := fmt.Sprintf("/syllabus/matiere/%d", fixture.MatiereID)

	// Fiche jamais écrite : 200, version 0, tout à nul.
	rec := appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	vide := decoder[gen.SyllabusMatiere](t, rec)
	assert.Equal(t, fixture.MatiereID, vide.MatiereID)
	assert.Equal(t, int32(0), vide.Version)
	assert.Nil(t, vide.Contexte)
	assert.Nil(t, vide.HeuresCours)
	assert.Nil(t, vide.ResponsableID)

	// Création par PUT (version 0). Ventilation encadrée : 15 + 4 + 1 + 3 = 23 h,
	// là où matiere.heure vaut 20 : l'écart s'enregistre (décision 2, tranchée).
	var heureMatiere float32
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT heure FROM matiere WHERE id = $1`, fixture.MatiereID).Scan(&heureMatiere))
	fiche := gen.SyllabusMatiere{
		Version:        0,
		Contexte:       str("Les systèmes logiciels évoluent vite."),
		Objectifs:      str("Gérer les dépendances."),
		HeuresCoursTd:  f64(15),
		HeuresTp:       f64(4),
		HeuresControle: f64(1),
		HeuresProjet:   f64(3),
		HeuresPerso:    f64(10),
		ResponsableID:  &agentID,
	}
	encadre := *fiche.HeuresCoursTd + *fiche.HeuresTp + *fiche.HeuresControle + *fiche.HeuresProjet
	require.NotEqual(t, float64(heureMatiere), encadre, "le test doit porter un écart avec matiere.heure")

	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, fiche)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	creee := decoder[gen.SyllabusMatiere](t, rec)
	assert.Equal(t, int32(1), creee.Version)
	assert.Equal(t, fixture.MatiereID, creee.MatiereID)
	assert.Equal(t, "Gérer les dépendances.", *creee.Objectifs)
	assert.Equal(t, 15.0, *creee.HeuresCoursTd)
	assert.Equal(t, agentID, *creee.ResponsableID)
	assert.Nil(t, creee.HeuresCours)

	// matiere.heure n'a pas bougé : le syllabus n'écrit rien dans la structure.
	var heureApres float32
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT heure FROM matiere WHERE id = $1`, fixture.MatiereID).Scan(&heureApres))
	assert.Equal(t, heureMatiere, heureApres)

	// Mise à jour avec la bonne version : version 2, un champ vidé le reste.
	creee.Objectifs = str("Gérer les dépendances et les risques.")
	creee.HeuresProjet = nil
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, creee)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	maj := decoder[gen.SyllabusMatiere](t, rec)
	assert.Equal(t, int32(2), maj.Version)
	assert.Equal(t, "Gérer les dépendances et les risques.", *maj.Objectifs)
	assert.Nil(t, maj.HeuresProjet)

	// GET relit l'état écrit.
	rec = appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil)
	require.Equal(t, http.StatusOK, rec.Code)
	relue := decoder[gen.SyllabusMatiere](t, rec)
	assert.Equal(t, maj, relue)

	// Version périmée : 409, rien n'a bougé.
	creee.Objectifs = str("Écriture concurrente")
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, creee) // version 1
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Equal(t, "OPTIMISTIC_LOCKING_FAILURE", decoder[probleme](t, rec).Code)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil)
	assert.Equal(t, maj, decoder[gen.SyllabusMatiere](t, rec))

	// L'identifiant du chemin fait foi : un matiere_id étranger dans le corps est ignoré.
	maj.MatiereID = 999999
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, maj)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Equal(t, fixture.MatiereID, decoder[gen.SyllabusMatiere](t, rec).MatiereID)
}

func TestIntegration_Syllabus_FicheMatiere_Validation(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "syl2")
	chemin := fmt.Sprintf("/syllabus/matiere/%d", fixture.MatiereID)

	cas := []struct {
		nom   string
		fiche gen.SyllabusMatiere
		champ string
		motif string
	}{
		{"heures négatives → CHECK nommé", gen.SyllabusMatiere{HeuresTp: f64(-1)}, "heures_tp", services.MotifValeurNegative},
		{"heures au-delà de NUMERIC(5,2) → plage", gen.SyllabusMatiere{HeuresCours: f64(1000)}, "heures_cours", services.MotifValeurHorsPlage},
		{"responsable inconnu → FK", gen.SyllabusMatiere{ResponsableID: func() *int32 { v := int32(987654); return &v }()}, "responsable_id", services.MotifReferenceInconnue},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			rec := appeler(t, pool, rolesEcriture, http.MethodPut, chemin, c.fiche)
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
			assert.Contains(t, rec.Header().Get("Content-Type"), "application/problem+json")
			p := decoder[probleme](t, rec)
			assert.Equal(t, "VALIDATION_ERROR", p.Code)
			require.Contains(t, p.Errors, c.champ)
			assert.Equal(t, c.motif, p.Errors[c.champ].Motif)
		})
	}

	// Aucune fiche n'a été créée par ces refus.
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM syllabus_matiere`).Scan(&n))
	assert.Equal(t, 0, n)

	// Matière inconnue, en lecture comme en écriture : le code NOT_FOUND, sur
	// l'enveloppe 400 que le projet émet pour une entité introuvable (parité
	// avec MatiereUse — le front route sur le code, pas sur le statut).
	rec := appeler(t, pool, rolesLecture, http.MethodGet, "/syllabus/matiere/987654", nil)
	assertIntrouvable(t, rec)
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, "/syllabus/matiere/987654", gen.SyllabusMatiere{})
	assertIntrouvable(t, rec)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, "/syllabus/matiere/abc", nil)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "INVALID_PARAM", decoder[probleme](t, rec).Code)
}

func assertIntrouvable(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "NOT_FOUND", decoder[probleme](t, rec).Code)
}

func TestIntegration_Syllabus_Roles(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "syl3")
	cheminMatiere := fmt.Sprintf("/syllabus/matiere/%d", fixture.MatiereID)
	cheminUE := fmt.Sprintf("/syllabus/ue/%d", fixture.UeID)

	// CONSULTATION lit, n'écrit pas.
	rec := appeler(t, pool, rolesLecture, http.MethodGet, cheminMatiere, nil)
	assert.Equal(t, http.StatusOK, rec.Code)
	rec = appeler(t, pool, rolesLecture, http.MethodPut, cheminMatiere, gen.SyllabusMatiere{})
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	assert.Equal(t, "INSUFFICIENT_RIGHTS", decoder[probleme](t, rec).Code)
	rec = appeler(t, pool, rolesLecture, http.MethodPut, cheminUE, gen.UniteEnseignement{Version: 1})
	assert.Equal(t, http.StatusForbidden, rec.Code)

	// STRUCTURE_ECRITURE n'écrit pas de syllabus : les domaines sont étanches.
	structure := []string{services.RoleConsultation, services.RoleStructureEcriture}
	rec = appeler(t, pool, structure, http.MethodPut, cheminMatiere, gen.SyllabusMatiere{})
	assert.Equal(t, http.StatusForbidden, rec.Code)
	rec = appeler(t, pool, structure, http.MethodPut, cheminUE, gen.UniteEnseignement{Version: 1})
	assert.Equal(t, http.StatusForbidden, rec.Code)

	// Sans aucun rôle (jeton sans realm_access) : refusé aussi en lecture.
	rec = appeler(t, pool, nil, http.MethodGet, cheminMatiere, nil)
	assert.Equal(t, http.StatusForbidden, rec.Code)

	// Le porteur d'ADMIN expose les neuf rôles fonctionnels : il écrit.
	rec = appeler(t, pool, services.RolesFonctionnels, http.MethodPut, cheminMatiere, gen.SyllabusMatiere{})
	assert.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// La liste fermée des rôles attribuables connaît le nouveau rôle.
	assert.True(t, services.IsAssignableRole(services.RoleSyllabusEcriture))
	assert.Contains(t, services.RolesFonctionnels, services.RoleSyllabusEcriture)
}

func TestIntegration_Syllabus_UniteEnseignement(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "syl4")
	agentID := creerAgent(t, pool, "agent-syl4@test.invalid")
	chemin := fmt.Sprintf("/syllabus/ue/%d", fixture.UeID)
	ueQueries := uegen.New(pool)

	avant, err := ueQueries.FetchUniteEnseignementById(context.Background(), fixture.UeID)
	require.NoError(t, err)
	require.Nil(t, avant.Description)

	// Écriture syllabus : description et responsable, name/ects intacts.
	rec := appeler(t, pool, rolesEcriture, http.MethodPut, chemin, gen.UniteEnseignement{
		Version:       avant.Version,
		Name:          "Nom que le syllabus ne doit pas écrire",
		Ects:          99,
		Description:   str("Pourquoi cette UE ? Parce que."),
		ResponsableID: &agentID,
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	maj := decoder[gen.UniteEnseignement](t, rec)
	assert.Equal(t, avant.Version+1, maj.Version)
	assert.Equal(t, avant.Name, maj.Name)
	assert.Equal(t, avant.Ects, maj.Ects)
	assert.Equal(t, "Pourquoi cette UE ? Parce que.", *maj.Description)
	assert.Equal(t, agentID, *maj.ResponsableID)

	// Réciproque : la mise à jour de structure ne touche pas au syllabus.
	version, err := ueQueries.UpdateUniteEnseignement(context.Background(), uegen.UpdateUniteEnseignementParams{
		ID: fixture.UeID, Version: maj.Version, Name: "UE renommée", Ects: 6, Academique: true,
	})
	require.NoError(t, err)
	apres, err := ueQueries.FetchUniteEnseignementById(context.Background(), fixture.UeID)
	require.NoError(t, err)
	assert.Equal(t, version, apres.Version)
	assert.Equal(t, "UE renommée", apres.Name)
	assert.Equal(t, "Pourquoi cette UE ? Parce que.", *apres.Description)
	assert.Equal(t, agentID, *apres.ResponsableID)

	// Version périmée : 409.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, gen.UniteEnseignement{Version: maj.Version, Description: str("tard")})
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Equal(t, "OPTIMISTIC_LOCKING_FAILURE", decoder[probleme](t, rec).Code)

	// Responsable inconnu : FK mappée.
	inconnu := int32(987654)
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, gen.UniteEnseignement{Version: apres.Version, ResponsableID: &inconnu})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, services.MotifReferenceInconnue, decoder[probleme](t, rec).Errors["responsable_id"].Motif)

	// UE inconnue.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, "/syllabus/ue/987654", gen.UniteEnseignement{Version: 1})
	assertIntrouvable(t, rec)
}

func TestIntegration_Syllabus_CycleDeVie(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "syl5")
	agentID := creerAgent(t, pool, "agent-syl5@test.invalid")
	cheminMatiere := fmt.Sprintf("/syllabus/matiere/%d", fixture.MatiereID)
	cheminUE := fmt.Sprintf("/syllabus/ue/%d", fixture.UeID)

	rec := appeler(t, pool, rolesEcriture, http.MethodPut, cheminMatiere, gen.SyllabusMatiere{Contexte: str("c"), ResponsableID: &agentID})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, cheminUE, gen.UniteEnseignement{Version: 1, ResponsableID: &agentID})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// Départ de l'agent : les fiches survivent, le responsable se vide (SET NULL).
	_, err := pool.Exec(context.Background(), `DELETE FROM public."user" WHERE id = $1`, agentID)
	require.NoError(t, err)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, cheminMatiere, nil)
	require.Equal(t, http.StatusOK, rec.Code)
	fiche := decoder[gen.SyllabusMatiere](t, rec)
	assert.Equal(t, int32(1), fiche.Version, "la fiche existe toujours")
	assert.Equal(t, "c", *fiche.Contexte)
	assert.Nil(t, fiche.ResponsableID)
	ue, err := uegen.New(pool).FetchUniteEnseignementById(context.Background(), fixture.UeID)
	require.NoError(t, err)
	assert.Nil(t, ue.ResponsableID)

	// Suppression de la matière : la fiche suit (CASCADE), et la matière est introuvable.
	_, err = pool.Exec(context.Background(), `DELETE FROM matiere WHERE id = $1`, fixture.MatiereID)
	require.NoError(t, err)
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM syllabus_matiere`).Scan(&n))
	assert.Equal(t, 0, n)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, cheminMatiere, nil)
	assertIntrouvable(t, rec)
}
