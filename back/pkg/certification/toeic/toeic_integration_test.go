package toeic_test

import (
	"bytes"
	"context"
	"cyb-react/pkg/certification/toeic"
	"cyb-react/pkg/services"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Changer l'élève d'un résultat TOEIC en édition était sans effet : le PUT
// portait `user_id`, la requête UpdateToeic ne l'écrivait pas (défaut consigné
// au lot 14, fermé au lot de nettoyage du 17 septembre 2026). La fixture
// partagée pose un TOEIC sur le premier élève ; le second le reprend.
func TestIntegration_ToeicUpdate_EcritLEleve(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "toeic")
	ctx := context.Background()

	var id, version int32
	require.NoError(t, pool.QueryRow(ctx, `SELECT id, version FROM toeic WHERE promotion_id = $1`, fixture.PromotionID).Scan(&id, &version))

	corps, err := json.Marshal(map[string]any{
		"id": id, "version": version, "score": 850,
		"date_passage": time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC).Format(time.RFC3339),
		"remarque":     "élève corrigé", "promotion_id": fixture.PromotionID, "user_id": fixture.UserIDs[1],
	})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPut, "/", bytes.NewReader(corps))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool}))
	rec := httptest.NewRecorder()
	toeic.Update(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var userID, score, versionApres int32
	require.NoError(t, pool.QueryRow(ctx, `SELECT user_id, score, version FROM toeic WHERE id = $1`, id).Scan(&userID, &score, &versionApres))
	assert.Equal(t, fixture.UserIDs[1], userID, "l'élève du résultat doit être celui du PUT")
	assert.Equal(t, int32(850), score)
	assert.Equal(t, version+1, versionApres)
}
