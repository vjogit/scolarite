package formation

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
)

// La route statique /delete-impact ne doit pas être captée par /{formationID}.
// Corps volontairement invalide : le handler répond 400 avant tout accès DB.
func TestRouteFormation_DeleteImpactEstRoutee(t *testing.T) {
	r := chi.NewRouter()
	r.Route("/formation", RouteFormation)

	req := httptest.NewRequest(http.MethodPost, "/formation/delete-impact", strings.NewReader("{"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "INVALID_BODY")
}
