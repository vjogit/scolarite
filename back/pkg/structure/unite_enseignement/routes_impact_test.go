package unite_enseignement

import (
	"context"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
)

// La route statique /delete-impact ne doit pas être captée par la route
// paramétrée. Corps volontairement invalide : le handler répond 400 avant tout
// accès DB. L'analyse d'impact est une lecture : CONSULTATION suffit.
func TestRoute_DeleteImpactEstRoutee(t *testing.T) {
	r := chi.NewRouter()
	r.Route("/ue", RouteUniteEnseignement)

	req := httptest.NewRequest(http.MethodPost, "/ue/delete-impact", strings.NewReader("{"))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), services.KeycloakRolesCtxKey, []string{services.RoleConsultation}))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "INVALID_BODY")
}
