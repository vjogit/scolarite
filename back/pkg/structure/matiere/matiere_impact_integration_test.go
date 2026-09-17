package matiere

import (
	"context"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Correction A1 (17 septembre 2026) : la matière a désormais son analyse
// d'impact. Elle compte sa fiche syllabus (0 ou 1) en plus de ses contrôles
// et notes ; une matière sans fiche ne la mentionne pas.
func TestIntegration_MatiereDeleteImpact(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "mai")
	services.SeedSyllabusFixture(t, pool, fixture)

	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.MatiereID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	resp := services.DecodeDeleteImpact(t, rec)
	require.Len(t, resp.Items, 1)
	assert.Equal(t, fixture.MatiereID, resp.Items[0].ID)
	assert.Equal(t, "Matiere 1 mai", resp.Items[0].Name)

	counts := services.CascadeCounts(resp)
	assert.Equal(t, int64(1), counts["syllabus_matiere"], "la fiche suit sa matière")
	assert.Equal(t, int64(2), counts["controle"])
	assert.Equal(t, int64(3), counts["note"])
	assert.NotContains(t, counts, "matiere", "la matière visée n'est pas son propre descendant")
	assert.NotContains(t, counts, "ue_competence", "la liaison appartient à l'UE, pas à la matière")
	// Les deux réservations de la fixture portent M1 : détachées, pas supprimées.
	require.Len(t, resp.Detached, 1)
	assert.Equal(t, "reservation", resp.Detached[0].Entity)
	assert.Equal(t, int64(2), resp.Detached[0].Count)
	assert.Empty(t, resp.Blocking)

	// Une matière sans fiche ni contrôle : aucune donnée liée.
	var matiereVide int32
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO matiere (name, version, heure, coeff, unite_enseignement_id) VALUES ('Matiere 2 mai', 1, 10, 1, $1) RETURNING id`,
		fixture.UeID).Scan(&matiereVide))
	reqVide := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{matiereVide})
	recVide := httptest.NewRecorder()
	DeleteImpact(recVide, reqVide)
	require.Equal(t, http.StatusOK, recVide.Code)
	respVide := services.DecodeDeleteImpact(t, recVide)
	assert.Empty(t, respVide.Cascade)
	assert.Empty(t, respVide.Detached)

	// Sélection multiple : une seule requête, décomptes cumulés — une seule fiche.
	reqMulti := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.MatiereID, matiereVide})
	recMulti := httptest.NewRecorder()
	DeleteImpact(recMulti, reqMulti)
	require.Equal(t, http.StatusOK, recMulti.Code)
	respMulti := services.DecodeDeleteImpact(t, recMulti)
	assert.Len(t, respMulti.Items, 2)
	assert.Equal(t, int64(1), services.CascadeCounts(respMulti)["syllabus_matiere"])
}
