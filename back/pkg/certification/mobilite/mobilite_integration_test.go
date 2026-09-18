package mobilite_test

import (
	"bytes"
	"context"
	"cyb-react/pkg/certification/mobilite"
	"cyb-react/pkg/services"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Même défaut que le TOEIC, découvert en le fermant (17 septembre 2026) :
// UpdateMobilite n'écrivait pas `user_id` alors que le formulaire monte le
// sélecteur d'élève en édition. La fixture pose une mobilité sur le premier
// élève ; le second la reprend.
func TestIntegration_MobiliteUpdate_EcritLEleve(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "mobi")
	ctx := context.Background()

	var id, version int32
	require.NoError(t, pool.QueryRow(ctx, `SELECT id, version FROM mobilite_internationale WHERE promotion_id = $1`, fixture.PromotionID).Scan(&id, &version))

	corps, err := json.Marshal(map[string]any{
		"id": id, "version": version, "pays": "Irlande", "ville": "Cork", "type_mobilite": "Stage",
		"date_debut": time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339),
		"date_fin":   time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC).Format(time.RFC3339),
		"est_valide": true, "remarque": "élève corrigé", "promotion_id": fixture.PromotionID, "user_id": fixture.UserIDs[1],
	})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPut, "/", bytes.NewReader(corps))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool}))
	rec := httptest.NewRecorder()
	mobilite.UpdateMobilite(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var userID, versionApres int32
	var estValide bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT user_id, est_valide, version FROM mobilite_internationale WHERE id = $1`, id).Scan(&userID, &estValide, &versionApres))
	assert.Equal(t, fixture.UserIDs[1], userID, "l'élève de la mobilité doit être celui du PUT")
	assert.True(t, estValide)
	assert.Equal(t, version+1, versionApres)
}
