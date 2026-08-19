package option

import (
	"context"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_OptionDeleteImpact(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "opt")

	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.OptionID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	resp := services.DecodeDeleteImpact(t, rec)

	require.Len(t, resp.Items, 1)
	assert.Equal(t, "Option 1 opt", resp.Items[0].Name)

	counts := services.CascadeCounts(resp)
	// Les deux branches sous option : groupes d'un côté, périodes de l'autre.
	assert.Equal(t, int64(1), counts["groupe"])
	assert.Equal(t, int64(1), counts["groupe_user"])
	assert.Equal(t, int64(2), counts["periode"])
	assert.Equal(t, int64(1), counts["unite_enseignement"])
	assert.Equal(t, int64(1), counts["matiere"])
	assert.Equal(t, int64(2), counts["controle"])
	assert.Equal(t, int64(3), counts["note"])
	assert.Equal(t, int64(2), counts["reservation"])
	assert.Equal(t, int64(1), counts["reservation_groupe"])
	assert.NotContains(t, counts, "toeic", "les certifications dépendent de la promotion, pas de l'option")
	assert.Empty(t, resp.Detached)
	assert.Empty(t, resp.Blocking)

	// L'option vide sœur n'annonce rien.
	reqVide := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.OptionVide})
	recVide := httptest.NewRecorder()
	DeleteImpact(recVide, reqVide)
	require.Equal(t, http.StatusOK, recVide.Code)
	assert.Empty(t, services.DecodeDeleteImpact(t, recVide).Cascade)
}

func TestIntegration_OptionDelete_BloqueParJury(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "optj")
	services.SeedJuryResult(t, pool, fixture)

	req := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.OptionID})
	rec := httptest.NewRecorder()
	Delete(rec, req)

	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())

	var reste int
	require.NoError(t, pool.QueryRow(context.Background(),
		"SELECT count(*) FROM option WHERE id = $1", fixture.OptionID).Scan(&reste))
	assert.Equal(t, 1, reste)
}
