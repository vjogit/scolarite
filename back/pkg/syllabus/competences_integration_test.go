package syllabus_test

// Tests d'intégration du référentiel de compétences et de la matrice de l'UE
// (lot 3). Mêmes helpers que syllabus_integration_test.go : fixture partagée,
// routeur monté avec ses gardes, rôles posés dans le contexte.
//
// Ils documentent les décisions tranchées : trois booléens et pas de table
// d'états (la ligne absente est « non adressée »), remplacement intégral sans
// verrou (dernier écrit gagne), et périmètre garanti côté serveur — une
// compétence d'une autre formation annule tout le remplacement, la matrice
// antérieure reste intacte.

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/formation"
	"cyb-react/pkg/syllabus/gen"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// creerBloc et creerCompetence passent par les routes : ce sont les écritures
// que l'écran d'administration fera.
func creerBloc(t *testing.T, pool *pgxpool.Pool, formationID int32, ordre int32, libelle string) gen.BlocCompetence {
	t.Helper()
	rec := appeler(t, pool, rolesEcriture, http.MethodPost, "/syllabus/bloc", gen.BlocCompetence{
		FormationID: formationID, Ordre: ordre, Libelle: libelle,
	})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	return decoder[gen.BlocCompetence](t, rec)
}

func creerCompetence(t *testing.T, pool *pgxpool.Pool, blocID int32, ordre int32, action string) gen.Competence {
	t.Helper()
	rec := appeler(t, pool, rolesEcriture, http.MethodPost, "/syllabus/competence", gen.Competence{
		BlocID: blocID, Ordre: ordre, Action: action,
	})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	return decoder[gen.Competence](t, rec)
}

func creerFormation(t *testing.T, pool *pgxpool.Pool, nom string) int32 {
	t.Helper()
	var id int32
	require.NoError(t, pool.QueryRow(context.Background(), `INSERT INTO formation (name, version) VALUES ($1, 1) RETURNING id`, nom).Scan(&id))
	return id
}

func lireMatrice(t *testing.T, pool *pgxpool.Pool, ueID int32) []gen.UeCompetence {
	t.Helper()
	rec := appeler(t, pool, rolesLecture, http.MethodGet, fmt.Sprintf("/syllabus/ue/%d/competences", ueID), nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	return decoder[[]gen.UeCompetence](t, rec)
}

func TestIntegration_Competences_Referentiel(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cmp1")

	// Formation inconnue ou absente du filtre.
	rec := appeler(t, pool, rolesLecture, http.MethodGet, "/syllabus/bloc?formation_id=987654", nil)
	assertIntrouvable(t, rec)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, "/syllabus/bloc", nil)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "MISSING_PARAM", decoder[probleme](t, rec).Code)

	// Liste vide : [] et non null.
	rec = appeler(t, pool, rolesLecture, http.MethodGet, fmt.Sprintf("/syllabus/bloc?formation_id=%d", fixture.FormationID), nil)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "[]\n", rec.Body.String())

	// Deux blocs créés dans le désordre : la liste les rend par ordre.
	bloc2 := creerBloc(t, pool, fixture.FormationID, 2, "Concevoir des applications")
	bloc1 := creerBloc(t, pool, fixture.FormationID, 1, "Sécuriser des systèmes")
	assert.Equal(t, int32(1), bloc1.Version)
	assert.Nil(t, bloc1.Code)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, fmt.Sprintf("/syllabus/bloc?formation_id=%d", fixture.FormationID), nil)
	blocs := decoder[[]gen.BlocCompetence](t, rec)
	require.Len(t, blocs, 2)
	assert.Equal(t, []int32{bloc1.ID, bloc2.ID}, []int32{blocs[0].ID, blocs[1].ID})

	// Ordre déjà pris sur la formation : refus ciblé sur `ordre`.
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, "/syllabus/bloc", gen.BlocCompetence{FormationID: fixture.FormationID, Ordre: 1, Libelle: "Doublon"})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	p := decoder[probleme](t, rec)
	assert.Equal(t, "VALIDATION_ERROR", p.Code)
	assert.Equal(t, services.MotifValeurDejaUtilisee, p.Errors["ordre"].Motif)

	// Libellé vide, ordre nul, formation inconnue : chaque contrainte nommée a son champ.
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, "/syllabus/bloc", gen.BlocCompetence{FormationID: fixture.FormationID, Ordre: 3, Libelle: ""})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, services.MotifChampObligatoire, decoder[probleme](t, rec).Errors["libelle"].Motif)
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, "/syllabus/bloc", gen.BlocCompetence{FormationID: fixture.FormationID, Ordre: 0, Libelle: "x"})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, services.MotifValeurNegative, decoder[probleme](t, rec).Errors["ordre"].Motif)
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, "/syllabus/bloc", gen.BlocCompetence{FormationID: 987654, Ordre: 1, Libelle: "x"})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, services.MotifReferenceInconnue, decoder[probleme](t, rec).Errors["formation_id"].Motif)

	// Mise à jour sous verrou : la formation ne se réécrit pas, la version avance.
	bloc1.Libelle = "Sécuriser et superviser des systèmes"
	bloc1.Code = str("INFRES-BC1")
	bloc1.FormationID = 987654
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, fmt.Sprintf("/syllabus/bloc/%d", bloc1.ID), bloc1)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	maj := decoder[gen.BlocCompetence](t, rec)
	assert.Equal(t, int32(2), maj.Version)
	assert.Equal(t, fixture.FormationID, maj.FormationID)
	assert.Equal(t, "INFRES-BC1", *maj.Code)
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, fmt.Sprintf("/syllabus/bloc/%d", bloc1.ID), bloc1) // version 1, périmée
	require.Equal(t, http.StatusConflict, rec.Code)
	assert.Equal(t, "OPTIMISTIC_LOCKING_FAILURE", decoder[probleme](t, rec).Code)

	// Compétences du bloc 1, dans le désordre, relues par ordre.
	c2 := creerCompetence(t, pool, bloc1.ID, 2, "Modéliser des solutions")
	c1 := creerCompetence(t, pool, bloc1.ID, 1, "Analyser les risques")
	rec = appeler(t, pool, rolesLecture, http.MethodGet, fmt.Sprintf("/syllabus/competence?bloc_id=%d", bloc1.ID), nil)
	require.Equal(t, http.StatusOK, rec.Code)
	competences := decoder[[]gen.Competence](t, rec)
	require.Len(t, competences, 2)
	assert.Equal(t, []int32{c1.ID, c2.ID}, []int32{competences[0].ID, competences[1].ID})
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, "/syllabus/competence", gen.Competence{BlocID: bloc1.ID, Ordre: 1, Action: "Doublon"})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, services.MotifValeurDejaUtilisee, decoder[probleme](t, rec).Errors["ordre"].Motif)
	rec = appeler(t, pool, rolesEcriture, http.MethodPost, "/syllabus/competence", gen.Competence{BlocID: 987654, Ordre: 1, Action: "x"})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, services.MotifReferenceInconnue, decoder[probleme](t, rec).Errors["bloc_id"].Motif)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, "/syllabus/competence?bloc_id=987654", nil)
	assertIntrouvable(t, rec)

	// Le référentiel à plat de la formation : bloc 1 (deux compétences) puis
	// bloc 2 (aucune, donc absent), chaque ligne portant son bloc.
	c3 := creerCompetence(t, pool, bloc2.ID, 1, "Concevoir une architecture")
	rec = appeler(t, pool, rolesLecture, http.MethodGet, fmt.Sprintf("/syllabus/competence?formation_id=%d", fixture.FormationID), nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	referentiel := decoder[[]gen.FetchReferentielByFormationIDRow](t, rec)
	require.Len(t, referentiel, 3)
	assert.Equal(t, []int32{c1.ID, c2.ID, c3.ID}, []int32{referentiel[0].ID, referentiel[1].ID, referentiel[2].ID})
	assert.Equal(t, "Sécuriser et superviser des systèmes", referentiel[0].BlocLibelle)
	assert.Equal(t, int32(2), referentiel[2].BlocOrdre)

	// Rôles : CONSULTATION lit, n'écrit pas ; STRUCTURE_ECRITURE non plus.
	rec = appeler(t, pool, rolesLecture, http.MethodPost, "/syllabus/bloc", gen.BlocCompetence{FormationID: fixture.FormationID, Ordre: 9, Libelle: "x"})
	assert.Equal(t, http.StatusForbidden, rec.Code)
	rec = appeler(t, pool, []string{services.RoleConsultation, services.RoleStructureEcriture}, http.MethodDelete, "/syllabus/bloc/bulk", BulkIDs{IDs: []int32{bloc1.ID}})
	assert.Equal(t, http.StatusForbidden, rec.Code)
	rec = appeler(t, pool, rolesEcriture, http.MethodGet, "/syllabus/bloc/abc", nil)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "INVALID_PARAM", decoder[probleme](t, rec).Code)
	rec = appeler(t, pool, rolesEcriture, http.MethodGet, "/syllabus/bloc/987654", nil)
	assertIntrouvable(t, rec)
}

// BulkIDs est le corps des suppressions groupées et des analyses d'impact.
type BulkIDs struct {
	IDs []int32 `json:"ids"`
}

func TestIntegration_Competences_Matrice(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cmp2")
	bloc1 := creerBloc(t, pool, fixture.FormationID, 1, "Bloc 1")
	bloc2 := creerBloc(t, pool, fixture.FormationID, 2, "Bloc 2")
	c11 := creerCompetence(t, pool, bloc1.ID, 1, "C1 du bloc 1")
	c12 := creerCompetence(t, pool, bloc1.ID, 2, "C2 du bloc 1")
	c21 := creerCompetence(t, pool, bloc2.ID, 1, "C1 du bloc 2")
	chemin := fmt.Sprintf("/syllabus/ue/%d/competences", fixture.UeID)

	// Rien n'est coché : [] et non null.
	assert.Empty(t, lireMatrice(t, pool, fixture.UeID))

	// Remplacement : trois lignes reçues dans le désordre, relues par bloc puis compétence.
	rec := appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{
		{UeID: 987654, CompetenceID: c21.ID, Enseignee: true},
		{CompetenceID: c12.ID, Evaluee: true},
		{CompetenceID: c11.ID, Enseignee: true, Evaluee: true},
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	ecrite := decoder[[]gen.UeCompetence](t, rec)
	require.Len(t, ecrite, 3)
	assert.Equal(t, []int32{c11.ID, c12.ID, c21.ID}, []int32{ecrite[0].CompetenceID, ecrite[1].CompetenceID, ecrite[2].CompetenceID})
	assert.Equal(t, fixture.UeID, ecrite[2].UeID, "l'identifiant du chemin fait foi")
	assert.True(t, ecrite[0].Enseignee)
	assert.False(t, ecrite[0].MiseEnOeuvre)
	assert.True(t, ecrite[0].Evaluee)
	assert.Equal(t, ecrite, lireMatrice(t, pool, fixture.UeID), "le GET rend exactement ce que le PUT a posé")

	// Nouveau remplacement, plus petit : les lignes absentes disparaissent —
	// pas de verrou, pas de version, idempotent.
	for range 2 {
		rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{{CompetenceID: c12.ID, MiseEnOeuvre: true}})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	}
	matrice := lireMatrice(t, pool, fixture.UeID)
	require.Len(t, matrice, 1)
	assert.Equal(t, c12.ID, matrice[0].CompetenceID)
	assert.True(t, matrice[0].MiseEnOeuvre)

	// La version de l'UE n'a pas bougé : un enregistrement de matrice ne
	// fait jamais 409 sur un écran de structure.
	var version int32
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT version FROM unite_enseignement WHERE id = $1`, fixture.UeID).Scan(&version))
	assert.Equal(t, int32(1), version)

	// Ligne aux trois axes faux : le CHECK nommé — la ligne absente est l'état
	// « non adressée », on ne l'écrit pas. Rien n'a bougé.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{{CompetenceID: c11.ID}})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, services.MotifChampObligatoire, decoder[probleme](t, rec).Errors["competence_id"].Motif)
	assert.Equal(t, matrice, lireMatrice(t, pool, fixture.UeID))

	// Compétence en double dans l'envoi : la clé primaire.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{{CompetenceID: c11.ID, Enseignee: true}, {CompetenceID: c11.ID, Evaluee: true}})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, services.MotifValeurDejaUtilisee, decoder[probleme](t, rec).Errors["competence_id"].Motif)
	assert.Equal(t, matrice, lireMatrice(t, pool, fixture.UeID))

	// Vider la matrice : un tableau vide est un remplacement comme un autre.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Empty(t, lireMatrice(t, pool, fixture.UeID))

	// Rôles et UE inconnue.
	rec = appeler(t, pool, rolesLecture, http.MethodPut, chemin, []gen.UeCompetence{})
	assert.Equal(t, http.StatusForbidden, rec.Code)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, "/syllabus/ue/987654/competences", nil)
	assertIntrouvable(t, rec)
}

func TestIntegration_Competences_Perimetre(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cmp3")
	bloc := creerBloc(t, pool, fixture.FormationID, 1, "Bloc de la formation")
	c1 := creerCompetence(t, pool, bloc.ID, 1, "Compétence de la formation")
	c2 := creerCompetence(t, pool, bloc.ID, 2, "Autre compétence de la formation")

	// Une seconde formation, avec son propre référentiel.
	etrangere := creerFormation(t, pool, "Formation étrangère cmp3")
	blocEtranger := creerBloc(t, pool, etrangere, 1, "Bloc étranger")
	cEtrangere := creerCompetence(t, pool, blocEtranger.ID, 1, "Compétence étrangère")

	chemin := fmt.Sprintf("/syllabus/ue/%d/competences", fixture.UeID)
	rec := appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{{CompetenceID: c1.ID, Enseignee: true}})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	avant := lireMatrice(t, pool, fixture.UeID)
	require.Len(t, avant, 1)

	// Compétence existante, autre formation : refus au motif hors_formation,
	// et la matrice antérieure est intacte — y compris la ligne valide qui
	// précédait la fautive dans l'envoi (rollback complet).
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{
		{CompetenceID: c2.ID, Evaluee: true},
		{CompetenceID: cEtrangere.ID, Enseignee: true},
	})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	p := decoder[probleme](t, rec)
	assert.Equal(t, "VALIDATION_ERROR", p.Code)
	assert.Equal(t, services.MotifHorsFormation, p.Errors["competence_id"].Motif)
	assert.Equal(t, avant, lireMatrice(t, pool, fixture.UeID), "la matrice antérieure reste intacte après rollback")

	// Identifiant inconnu : reference_inconnue, distinct du périmètre.
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{{CompetenceID: 987654, Enseignee: true}})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, services.MotifReferenceInconnue, decoder[probleme](t, rec).Errors["competence_id"].Motif)
	assert.Equal(t, avant, lireMatrice(t, pool, fixture.UeID))

	// Le référentiel à plat ne mélange pas les formations.
	rec = appeler(t, pool, rolesLecture, http.MethodGet, fmt.Sprintf("/syllabus/competence?formation_id=%d", fixture.FormationID), nil)
	require.Equal(t, http.StatusOK, rec.Code)
	for _, ligne := range decoder[[]gen.FetchReferentielByFormationIDRow](t, rec) {
		assert.NotEqual(t, cEtrangere.ID, ligne.ID)
	}
}

func TestIntegration_Competences_Suppression(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cmp4")
	bloc := creerBloc(t, pool, fixture.FormationID, 1, "Bloc à supprimer")
	c1 := creerCompetence(t, pool, bloc.ID, 1, "C1")
	c2 := creerCompetence(t, pool, bloc.ID, 2, "C2")
	chemin := fmt.Sprintf("/syllabus/ue/%d/competences", fixture.UeID)
	rec := appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{
		{CompetenceID: c1.ID, Enseignee: true}, {CompetenceID: c2.ID, Evaluee: true},
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// Impact d'un bloc : deux compétences, deux liaisons, en lecture.
	rec = appeler(t, pool, rolesLecture, http.MethodPost, "/syllabus/bloc/delete-impact", BulkIDs{IDs: []int32{bloc.ID}})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	impact := decoder[services.DeleteImpactResponse](t, rec)
	require.Len(t, impact.Items, 1)
	assert.Equal(t, "Bloc à supprimer", impact.Items[0].Name)
	counts := services.CascadeCounts(impact)
	assert.Equal(t, int64(2), counts["competence"])
	assert.Equal(t, int64(2), counts["ue_competence"])
	assert.Empty(t, impact.Blocking)

	// Impact d'une compétence : sa liaison.
	rec = appeler(t, pool, rolesLecture, http.MethodPost, "/syllabus/competence/delete-impact", BulkIDs{IDs: []int32{c1.ID}})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	impact = decoder[services.DeleteImpactResponse](t, rec)
	assert.Equal(t, "C1", impact.Items[0].Name)
	assert.Equal(t, int64(1), services.CascadeCounts(impact)["ue_competence"])

	// La formation annonce aussi son référentiel dans sa propre analyse d'impact.
	r := chi.NewRouter()
	r.Route("/formation", formation.RouteFormation)
	recFormation := httptest.NewRecorder()
	r.ServeHTTP(recFormation, requete(t, pool, rolesLecture, http.MethodPost, "/formation/delete-impact", BulkIDs{IDs: []int32{fixture.FormationID}}))
	require.Equal(t, http.StatusOK, recFormation.Code, recFormation.Body.String())
	countsFormation := services.CascadeCounts(decoder[services.DeleteImpactResponse](t, recFormation))
	assert.Equal(t, int64(1), countsFormation["bloc_competence"])
	assert.Equal(t, int64(2), countsFormation["competence"])
	assert.Equal(t, int64(2), countsFormation["ue_competence"])

	// Suppression d'une compétence : sa liaison suit, l'autre reste.
	rec = appeler(t, pool, rolesEcriture, http.MethodDelete, "/syllabus/competence/bulk", BulkIDs{IDs: []int32{c1.ID}})
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	matrice := lireMatrice(t, pool, fixture.UeID)
	require.Len(t, matrice, 1)
	assert.Equal(t, c2.ID, matrice[0].CompetenceID)

	// Suppression du bloc : compétences et liaisons partent en cascade.
	rec = appeler(t, pool, rolesEcriture, http.MethodDelete, "/syllabus/bloc/bulk", BulkIDs{IDs: []int32{bloc.ID}})
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	assert.Empty(t, lireMatrice(t, pool, fixture.UeID))
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM competence`).Scan(&n))
	assert.Equal(t, 0, n)
	rec = appeler(t, pool, rolesLecture, http.MethodGet, fmt.Sprintf("/syllabus/bloc/%d", bloc.ID), nil)
	assertIntrouvable(t, rec)

	// Suppression de l'UE : ses liaisons suivent (CASCADE) sans toucher au référentiel.
	bloc = creerBloc(t, pool, fixture.FormationID, 1, "Bloc qui reste")
	c1 = creerCompetence(t, pool, bloc.ID, 1, "C1")
	rec = appeler(t, pool, rolesEcriture, http.MethodPut, chemin, []gen.UeCompetence{{CompetenceID: c1.ID, Enseignee: true}})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	_, err := pool.Exec(context.Background(), `DELETE FROM unite_enseignement WHERE id = $1`, fixture.UeID)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM ue_competence`).Scan(&n))
	assert.Equal(t, 0, n)
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM competence`).Scan(&n))
	assert.Equal(t, 1, n)
}
