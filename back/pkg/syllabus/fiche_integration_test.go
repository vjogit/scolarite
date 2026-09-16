package syllabus_test

// Les deux routes PDF du lot 5, contre la base d'intégration et le service
// Gotenberg réel (décision 5 : le PDF est smoke-testé — en-tête %PDF, taille
// plancher, type de contenu — jamais comparé à un fichier de référence). Le
// service se cherche sur GOTENBERG_URL, sinon à l'adresse de la composition
// locale ; injoignable, les tests qui en dépendent se sautent explicitement.
// Le 503 d'un service arrêté, lui, se prouve sans service : un convertisseur
// pointé sur un port fermé.

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func urlGotenberg() string {
	if u := os.Getenv("GOTENBERG_URL"); u != "" {
		return u
	}
	return "http://10.20.2.7:3000"
}

// convertisseurTest : le client du routeur de test, vers le service local.
// Les tests qui n'appellent pas les routes PDF ne le sollicitent jamais.
func convertisseurTest() *services.ConvertisseurPDF {
	return services.NewConvertisseurPDF(services.PDFConfig{URL: urlGotenberg(), Timeout: 25 * time.Second})
}

// exigerGotenberg saute le test si le service ne répond pas sur /health.
func exigerGotenberg(t *testing.T) {
	t.Helper()
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(urlGotenberg() + "/health")
	if err != nil {
		t.Skipf("Skipping integration test: Gotenberg non accessible sur %s (%v)", urlGotenberg(), err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Skipf("Skipping integration test: Gotenberg répond %d sur /health", resp.StatusCode)
	}
}

func routeurAvec(pdf *services.ConvertisseurPDF) chi.Router {
	r := chi.NewRouter()
	r.Route("/syllabus", func(r chi.Router) { syllabus.RouteSyllabus(r, pdf, "Établissement test") })
	return r
}

func appelerAvec(t *testing.T, routeur chi.Router, pool *pgxpool.Pool, roles []string, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	routeur.ServeHTTP(rec, requete(t, pool, roles, http.MethodGet, path, nil))
	return rec
}

func TestIntegration_FichePDF_Smoke(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	exigerGotenberg(t)
	fixture := services.SeedStructureFixture(t, pool, "pdf1")

	// Une fiche et une liaison, pour que le document porte du contenu.
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO syllabus_matiere (matiere_id, contexte, heures_cours_td, heures_tp) VALUES ($1, 'Contexte de test', 15, 4)`, fixture.MatiereID)
	require.NoError(t, err)
	var blocID, competenceID int32
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO bloc_competence (formation_id, ordre, libelle) VALUES ($1, 1, 'Bloc pdf') RETURNING id`, fixture.FormationID).Scan(&blocID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO competence (bloc_id, ordre, action) VALUES ($1, 1, 'Analyser pdf') RETURNING id`, blocID).Scan(&competenceID))
	_, err = pool.Exec(ctx, `INSERT INTO ue_competence (ue_id, competence_id, enseignee) VALUES ($1, $2, true)`, fixture.UeID, competenceID)
	require.NoError(t, err)

	routeur := routeurAvec(convertisseurTest())
	chemin := fmt.Sprintf("/syllabus/ue/%d/fiche", fixture.UeID)

	for _, lang := range []string{"", "fr", "en"} {
		t.Run("lang="+lang, func(t *testing.T) {
			debut := time.Now()
			rec := appelerAvec(t, routeur, pool, rolesLecture, chemin+"?lang="+lang)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			assert.Equal(t, "application/pdf", rec.Header().Get("Content-Type"))
			attendu := "fr"
			if lang == "en" {
				attendu = "en"
			}
			assert.Equal(t, fmt.Sprintf(`attachment; filename="syllabus-ue-ue-1-pdf1-%s.pdf"`, attendu), rec.Header().Get("Content-Disposition"))
			assert.True(t, bytes.HasPrefix(rec.Body.Bytes(), []byte("%PDF")), "en-tête PDF attendu")
			assert.Greater(t, rec.Body.Len(), 5_000, "un document de deux pages pèse plus que cela")
			assert.Equal(t, fmt.Sprint(rec.Body.Len()), rec.Header().Get("Content-Length"))
			t.Logf("fiche %s : %d octets en %s", attendu, rec.Body.Len(), time.Since(debut).Round(time.Millisecond))
		})
	}

	// Sans rôle de lecture : 403 — le serveur impose.
	rec := appelerAvec(t, routeur, pool, nil, chemin)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestIntegration_FichePDF_Refus(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "pdf2")
	routeur := routeurAvec(convertisseurTest())

	// Langue inconnue : 400 avant toute lecture.
	rec := appelerAvec(t, routeur, pool, rolesLecture, fmt.Sprintf("/syllabus/ue/%d/fiche?lang=de", fixture.UeID))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "INVALID_PARAM", decoder[probleme](t, rec).Code)

	// UE inconnue : NOT_FOUND sur l'enveloppe 400 du projet.
	rec = appelerAvec(t, routeur, pool, rolesLecture, "/syllabus/ue/999999/fiche")
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "NOT_FOUND", decoder[probleme](t, rec).Code)

	// Promotion inconnue, idem.
	rec = appelerAvec(t, routeur, pool, rolesLecture, "/syllabus/promotion/999999/livret")
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "NOT_FOUND", decoder[probleme](t, rec).Code)

	// UE dont la période est en corbeille : plus de chemin par les vues
	// actives, NOT_FOUND — la fiche ne se génère pas depuis la corbeille.
	var opID int32
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO corbeille_operation (racine_type, deleted_by) VALUES ('periode', 'test') RETURNING id`).Scan(&opID))
	_, err := pool.Exec(context.Background(), `UPDATE periode SET deleted_at = now(), delete_op_id = $1 WHERE id = $2`, opID, fixture.PeriodeID)
	require.NoError(t, err)
	rec = appelerAvec(t, routeur, pool, rolesLecture, fmt.Sprintf("/syllabus/ue/%d/fiche", fixture.UeID))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "NOT_FOUND", decoder[probleme](t, rec).Code)
}

func TestIntegration_FichePDF_ServiceArrete_503(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "pdf3")
	// Port fermé : la connexion est refusée immédiatement, sans service.
	ferme := services.NewConvertisseurPDF(services.PDFConfig{URL: "http://127.0.0.1:1", Timeout: 2 * time.Second})
	routeur := routeurAvec(ferme)

	rec := appelerAvec(t, routeur, pool, rolesLecture, fmt.Sprintf("/syllabus/ue/%d/fiche", fixture.UeID))
	require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
	assert.Equal(t, "application/problem+json; charset=utf-8", rec.Header().Get("Content-Type"))
	p := decoder[probleme](t, rec)
	assert.Equal(t, "SERVICE_UNAVAILABLE", p.Code)
	assert.NotContains(t, rec.Body.String(), "127.0.0.1", "la cause reste au log")

	rec = appelerAvec(t, routeur, pool, rolesLecture, fmt.Sprintf("/syllabus/promotion/%d/livret", fixture.PromotionID))
	require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
	assert.Equal(t, "SERVICE_UNAVAILABLE", decoder[probleme](t, rec).Code)
}

func TestIntegration_LivretPDF_Smoke(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	exigerGotenberg(t)
	fixture := services.SeedStructureFixture(t, pool, "pdf4")
	routeur := routeurAvec(convertisseurTest())

	// La promotion P1 : deux options, deux périodes, une UE. Titre + 2 pages.
	debut := time.Now()
	rec := appelerAvec(t, routeur, pool, rolesLecture, fmt.Sprintf("/syllabus/promotion/%d/livret?lang=en", fixture.PromotionID))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Equal(t, "application/pdf", rec.Header().Get("Content-Type"))
	assert.Equal(t, `attachment; filename="syllabus-livret-promo-1-pdf4-en.pdf"`, rec.Header().Get("Content-Disposition"))
	assert.True(t, bytes.HasPrefix(rec.Body.Bytes(), []byte("%PDF")))
	assert.Greater(t, rec.Body.Len(), 5_000)
	t.Logf("livret : %d octets en %s", rec.Body.Len(), time.Since(debut).Round(time.Millisecond))

	// La promotion vide (P2) : une page de titre seule, encore un PDF.
	rec = appelerAvec(t, routeur, pool, rolesLecture, fmt.Sprintf("/syllabus/promotion/%d/livret", fixture.PromotionVide))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.True(t, bytes.HasPrefix(rec.Body.Bytes(), []byte("%PDF")))
}
