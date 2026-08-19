package promotion

import (
	"context"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_PromotionDeleteImpact(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "prm")

	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.PromotionID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	resp := services.DecodeDeleteImpact(t, rec)

	require.Len(t, resp.Items, 1)
	assert.Equal(t, fixture.PromotionID, resp.Items[0].ID)
	assert.Equal(t, "Promo 1 prm", resp.Items[0].Name)

	counts := services.CascadeCounts(resp)
	assert.NotContains(t, counts, "promotion", "la promotion visée n'est pas son propre descendant")
	assert.Equal(t, int64(1), counts["toeic"])
	assert.Equal(t, int64(1), counts["mobilite_internationale"])
	assert.Equal(t, int64(2), counts["option"])
	assert.Equal(t, int64(1), counts["groupe"])
	assert.Equal(t, int64(1), counts["groupe_user"])
	assert.Equal(t, int64(2), counts["periode"])
	assert.Equal(t, int64(1), counts["unite_enseignement"])
	assert.Equal(t, int64(1), counts["matiere"])
	assert.Equal(t, int64(2), counts["controle"])
	assert.Equal(t, int64(3), counts["note"])
	assert.Equal(t, int64(2), counts["reservation"])
	assert.Empty(t, resp.Detached)
	assert.Empty(t, resp.Blocking)

	// La seconde promotion, vide, n'entraîne aucune cascade.
	reqVide := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.PromotionVide})
	recVide := httptest.NewRecorder()
	DeleteImpact(recVide, reqVide)
	require.Equal(t, http.StatusOK, recVide.Code)
	respVide := services.DecodeDeleteImpact(t, recVide)
	assert.Empty(t, respVide.Cascade)
	require.Len(t, respVide.Items, 1)

	// Sélection multiple : une seule requête, décomptes cumulés.
	reqMulti := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact",
		[]int32{fixture.PromotionID, fixture.PromotionVide})
	recMulti := httptest.NewRecorder()
	DeleteImpact(recMulti, reqMulti)
	require.Equal(t, http.StatusOK, recMulti.Code)
	respMulti := services.DecodeDeleteImpact(t, recMulti)
	assert.Len(t, respMulti.Items, 2)
	assert.Equal(t, int64(3), services.CascadeCounts(respMulti)["note"])
}

func TestIntegration_PromotionDelete_BloqueParJury(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "prmj")
	services.SeedJuryResult(t, pool, fixture)

	req := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.PromotionID})
	rec := httptest.NewRecorder()
	Delete(rec, req)

	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "BUSINESS_CONFLICT")

	var reste int
	require.NoError(t, pool.QueryRow(context.Background(),
		"SELECT count(*) FROM promotion WHERE id = $1", fixture.PromotionID).Scan(&reste))
	assert.Equal(t, 1, reste)
}
