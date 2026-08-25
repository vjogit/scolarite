package user_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cyb-react/pkg/services"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_User_UserUse_IdentifiantInvalideOuInexistant(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	resetUsers(t, pool)
	router := userRouter(cfg)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodGet, "/abc", nil))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "INVALID_PARAM", decodeProblem(t, rec).Code)

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodGet, "/999999999", nil))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "NOT_FOUND", decodeProblem(t, rec).Code)
}

// FetchAllUser expose keycloak_id (l'écran /user l'affiche en colonne,
// front/src/pages/user/User.tsx) ; SearchUsers, lui, ne le porte pas dans sa
// requête SQL (SearchUsersRow) — deux contrats distincts, pas une fuite.
func TestIntegration_User_FetchAllUser_ExposeKeycloakID_SearchUsersNon(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	agent := createTestAgent(t, pool, cfg, kc, nil)
	router := userRouter(cfg)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodGet, "/", nil))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var all []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &all))
	require.NotEmpty(t, all)
	assert.Contains(t, all[0], "keycloak_id")

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodGet, "/search?q="+*agent.LastName, nil))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var found []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &found))
	require.NotEmpty(t, found)
	assert.NotContains(t, found[0], "keycloak_id")
}

// Le précédent d951fc2 fait loi : un tableau vide, jamais null.
func TestIntegration_User_SearchUsers_SansResultat_TableauVide(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	resetUsers(t, pool)

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, newRequest(t, pool, http.MethodGet, "/search?q=IntrouvableXYZ", nil))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Equal(t, "[]", strings.TrimSpace(rec.Body.String()))
}
