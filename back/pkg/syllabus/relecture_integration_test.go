package syllabus_test

// Traduction du contenu (lot 6) : lecture, relecture, proposition. Le
// traducteur est le connecteur factice — aucun appel réseau, ici comme en CI.
// Ce que les tests affirment : le français fait référence (une source sans
// fiche ne se traduit pas), la péremption suit les TEXTES de la source et non
// son compteur de version, elle est signalée et jamais bloquante, « relue » se
// perd quand on retraduit, et un traducteur en panne répond 503 sans rien
// écrire.

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"cyb-react/pkg/ia/factice"
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus"
	"cyb-react/pkg/syllabus/gen"
	"cyb-react/pkg/syllabus/traduction"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func traducteurTest() *traduction.Traducteur {
	return &traduction.Traducteur{Connecteur: &factice.Connecteur{}}
}

// appelerTraducteur : le même appel, sur un routeur monté avec le traducteur donné
// (nil : aucun traducteur configuré).
func appelerTraducteur(t *testing.T, pool *pgxpool.Pool, tr *traduction.Traducteur, roles []string, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Route("/syllabus", func(r chi.Router) { syllabus.RouteSyllabus(r, convertisseurTest(), "Établissement test", tr) })
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, requete(t, pool, roles, method, path, body))
	return rec
}

func TestIntegration_Traduction_FicheMatiere_Cycle(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "trad1")
	fiche := fmt.Sprintf("/syllabus/matiere/%d", fixture.MatiereID)
	chemin := fiche + "/traduction/en"

	// Jamais traduite, fiche jamais écrite : 200, version 0, pas de source.
	rec := appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	vide := decoder[syllabus.TraductionMatiereReponse](t, rec)
	assert.Equal(t, int32(0), vide.Version)
	assert.Equal(t, int32(0), vide.SourceVersion)
	assert.False(t, vide.Perimee)
	assert.True(t, vide.TraductionAutomatique)

	// Le français fait référence : sans fiche, rien à traduire.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, gen.SyllabusMatiereTraduction{
		Contexte: str("Orphan"), Statut: traduction.StatutRelue, EmpreinteSource: fmt.Sprintf("%064d", 0),
	})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, services.MotifReferenceInconnue, decoder[probleme](t, rec).Errors["matiere_id"].Motif)
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, chemin+"/proposition", map[string]string{"champ": "contexte"})
	assert.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "NOT_FOUND", decoder[probleme](t, rec).Code)

	// La source : contexte et plan de cours à puces, 20 h.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, fiche, gen.SyllabusMatiere{
		Contexte: str("Les réseaux locaux."), PlanCours: str("- Ethernet\n- Wi-Fi"), HeuresCours: f64(20),
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	etat := decoder[syllabus.TraductionMatiereReponse](t, appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil))
	require.Equal(t, int32(1), etat.SourceVersion)
	require.Len(t, etat.SourceEmpreinte, 64)

	// Proposition : un champ, rien d'écrit.
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, chemin+"/proposition", map[string]string{"champ": "plan_cours"})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	proposition := decoder[syllabus.Proposition](t, rec)
	assert.Equal(t, "- [en] Ethernet\n- [en] Wi-Fi", proposition.Texte)
	assert.Equal(t, etat.SourceEmpreinte, proposition.SourceEmpreinte)
	assert.Equal(t, int32(0), decoder[syllabus.TraductionMatiereReponse](t, appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil)).Version)
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, chemin+"/proposition", map[string]string{"champ": "inconnu"})
	assert.Equal(t, http.StatusBadRequest, rec.Code)

	// L'écran enregistre ce que la machine a proposé : automatique, modèle nommé.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, gen.SyllabusMatiereTraduction{
		Contexte: str("[en] Les réseaux locaux."), PlanCours: &proposition.Texte,
		Statut: traduction.StatutAutomatique, VersionSource: etat.SourceVersion, EmpreinteSource: etat.SourceEmpreinte,
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	auto := decoder[syllabus.TraductionMatiereReponse](t, rec)
	assert.Equal(t, int32(1), auto.Version)
	assert.Equal(t, traduction.StatutAutomatique, auto.Statut)
	require.NotNil(t, auto.Modele)
	assert.Equal(t, "factice/test", *auto.Modele)
	assert.False(t, auto.Perimee)

	// Le rédacteur dispose : relue, le dernier traducteur passé reste nommé.
	relue := gen.SyllabusMatiereTraduction{
		Version: auto.Version, Contexte: str("Local area networks."), PlanCours: str("- Ethernet\n- Wi-Fi"),
		Statut: traduction.StatutRelue, VersionSource: etat.SourceVersion, EmpreinteSource: etat.SourceEmpreinte,
	}
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, relue)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	apresRelecture := decoder[syllabus.TraductionMatiereReponse](t, rec)
	assert.Equal(t, traduction.StatutRelue, apresRelecture.Statut)
	assert.Equal(t, "factice/test", *apresRelecture.Modele)

	// Verrou optimiste : la version d'avant la relecture est refusée.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, relue)
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Equal(t, "OPTIMISTIC_LOCKING_FAILURE", decoder[probleme](t, rec).Code)

	// La version de la source avance sans que ses textes changent (les heures) :
	// la traduction n'est PAS périmée — c'est l'empreinte qui juge.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, fiche, gen.SyllabusMatiere{
		Version: 1, Contexte: str("Les réseaux locaux."), PlanCours: str("- Ethernet\n- Wi-Fi"), HeuresCours: f64(18),
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	etat = decoder[syllabus.TraductionMatiereReponse](t, appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil))
	assert.Equal(t, int32(2), etat.SourceVersion)
	assert.False(t, etat.Perimee, "un changement d'heures ne périme pas la traduction")

	// Un texte de la source change : périmée — signalé, jamais bloquant.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, fiche, gen.SyllabusMatiere{
		Version: 2, Contexte: str("Les réseaux locaux et étendus."), PlanCours: str("- Ethernet\n- Wi-Fi"), HeuresCours: f64(18),
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	etat = decoder[syllabus.TraductionMatiereReponse](t, appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil))
	assert.True(t, etat.Perimee)
	assert.Equal(t, traduction.StatutRelue, etat.Statut, "la péremption ne touche pas au statut")

	// Relire contre la source courante guérit la péremption.
	relue.Version, relue.VersionSource, relue.EmpreinteSource = etat.Version, etat.SourceVersion, etat.SourceEmpreinte
	relue.Contexte = str("Local and wide area networks.")
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, relue)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.False(t, decoder[syllabus.TraductionMatiereReponse](t, rec).Perimee)

	// La traduction suit sa fiche, donc sa matière, par cascade.
	_, err := pool.Exec(t.Context(), `DELETE FROM matiere WHERE id = $1`, fixture.MatiereID)
	require.NoError(t, err)
	var n int
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM syllabus_matiere_traduction WHERE matiere_id = $1`, fixture.MatiereID).Scan(&n))
	assert.Zero(t, n)
}

func TestIntegration_Traduction_Refus(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "trad2")
	chemin := fmt.Sprintf("/syllabus/matiere/%d/traduction", fixture.MatiereID)
	corps := gen.SyllabusMatiereTraduction{Statut: traduction.StatutRelue, EmpreinteSource: fmt.Sprintf("%064d", 0)}

	// Lecture seule : ni relecture ni proposition.
	assert.Equal(t, http.StatusForbidden, appeler(t, pool, rolesLecture, http.MethodPut, chemin+"/en", corps).Code)
	assert.Equal(t, http.StatusForbidden, appeler(t, pool, rolesLecture, http.MethodPost, chemin+"/en/proposition", map[string]string{"champ": "contexte"}).Code)

	// Langue hors périmètre, et le français n'est pas une traduction.
	for _, langue := range []string{"de", "fr"} {
		rec := appeler(t, pool, rolesLecture, http.MethodGet, chemin+"/"+langue, nil)
		require.Equal(t, http.StatusBadRequest, rec.Code, langue)
		assert.Equal(t, "INVALID_PARAM", decoder[probleme](t, rec).Code)
	}

	// Statut et empreinte inconnus : 400 ciblé, avant toute écriture.
	rec := appeler(t, pool, rolesEcriture, http.MethodPut, chemin+"/en", gen.SyllabusMatiereTraduction{Statut: "parfaite", EmpreinteSource: "abc"})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	p := decoder[probleme](t, rec)
	assert.Contains(t, p.Errors, "statut")
	assert.Contains(t, p.Errors, "empreinte_source")
}

func TestIntegration_Traduction_TraducteurIndisponible_Renvoie503(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "trad3")
	fiche := fmt.Sprintf("/syllabus/matiere/%d", fixture.MatiereID)
	require.Equal(t, http.StatusOK, appeler(t, pool, rolesEcriture, http.MethodPut, fiche, gen.SyllabusMatiere{Contexte: str("Un contexte assez long pour que les garde-fous jugent la longueur.")}).Code)
	proposition := fiche + "/traduction/en/proposition"
	champ := map[string]string{"champ": "contexte"}

	cas := map[string]*traduction.Traducteur{
		"aucun traducteur configuré":      nil,
		"fournisseur en panne":            {Connecteur: &factice.Connecteur{Erreur: func(int) error { return errors.New("connexion refusée") }}},
		"sortie refusée par un garde-fou": {Connecteur: &factice.Connecteur{Reponse: func(_, _ string) string { return "No." }}},
	}
	for nom, tr := range cas {
		rec := appelerTraducteur(t, pool, tr, rolesEcriture, http.MethodPost, proposition, champ)
		require.Equal(t, http.StatusServiceUnavailable, rec.Code, nom)
		assert.Equal(t, "SERVICE_UNAVAILABLE", decoder[probleme](t, rec).Code, nom)
		assert.NotContains(t, rec.Body.String(), "connexion refusée", "la cause ne sort pas sur le fil")
	}

	// Sans traducteur, le GET le dit : l'écran n'offrira pas le bouton.
	rec := appelerTraducteur(t, pool, nil, rolesLecture, http.MethodGet, fiche+"/traduction/en", nil)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.False(t, decoder[syllabus.TraductionMatiereReponse](t, rec).TraductionAutomatique)
}

func TestIntegration_Traduction_DescriptionUe(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "trad4")
	ue := fmt.Sprintf("/syllabus/ue/%d", fixture.UeID)
	chemin := ue + "/traduction/en"

	rec := appeler(t, pool, rolesEcriture, http.MethodPut, ue, map[string]any{"version": 1, "description": "Pourquoi cette UE : les fondations."})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	etat := decoder[syllabus.TraductionUeReponse](t, appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil))
	assert.Equal(t, int32(0), etat.Version)
	assert.Equal(t, int32(2), etat.SourceVersion)

	rec = appeler(t, pool, rolesEcriture, http.MethodPost, chemin+"/proposition", map[string]string{"champ": "description"})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	proposition := decoder[syllabus.Proposition](t, rec)
	assert.Equal(t, "[en] Pourquoi cette UE : les fondations.", proposition.Texte)

	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, gen.UniteEnseignementTraduction{
		Description: &proposition.Texte, Statut: traduction.StatutAutomatique,
		VersionSource: proposition.SourceVersion, EmpreinteSource: proposition.SourceEmpreinte,
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.False(t, decoder[syllabus.TraductionUeReponse](t, rec).Perimee)

	// Le domaine STRUCTURE fait avancer la version de l'UE (nom, ECTS) sans
	// toucher à la description : pas de péremption.
	_, err := pool.Exec(t.Context(), `UPDATE unite_enseignement SET ects = ects + 1, version = version + 1 WHERE id = $1`, fixture.UeID)
	require.NoError(t, err)
	etat = decoder[syllabus.TraductionUeReponse](t, appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil))
	assert.Equal(t, int32(3), etat.SourceVersion)
	assert.False(t, etat.Perimee)

	_, err = pool.Exec(t.Context(), `UPDATE unite_enseignement SET description = 'Autre texte.' WHERE id = $1`, fixture.UeID)
	require.NoError(t, err)
	assert.True(t, decoder[syllabus.TraductionUeReponse](t, appeler(t, pool, rolesLecture, http.MethodGet, chemin, nil)).Perimee)
}
