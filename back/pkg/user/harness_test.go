package user_test

// Harnais commun des tests d'intégration du paquet user, dans le style de
// pkg/registre/registre_integration_test.go : pool réel, handlers appelés en
// direct, sub et pool injectés dans le contexte comme le font les
// middlewares (DatabaseMiddleware, AuthMiddleware).

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"cyb-react/pkg/services"
	"cyb-react/pkg/user"
	"cyb-react/pkg/user/gen"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const subTest = "kc-agent-user-test"

func newRequest(t *testing.T, pool *pgxpool.Pool, method, path string, body any) *http.Request {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	return withTestContext(httptest.NewRequest(method, path, reader), pool)
}

// newRawRequest envoie un corps JSON construit à la main : nécessaire pour
// distinguer un champ "roles" absent d'un champ présent à liste vide — la
// sémantique de Roles: nil («ne pas toucher aux rôles») en dépend.
func newRawRequest(t *testing.T, pool *pgxpool.Pool, method, path string, raw []byte) *http.Request {
	t.Helper()
	return withTestContext(httptest.NewRequest(method, path, bytes.NewReader(raw)), pool)
}

func withTestContext(req *http.Request, pool *pgxpool.Pool) *http.Request {
	ctx := context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool})
	ctx = context.WithValue(ctx, services.KeycloakSubCtxKey, subTest)
	return req.WithContext(ctx)
}

// userRouter monte les handlers comme user.RouteUser, sans le middleware de
// rôles : le RBAC des routes user est déjà couvert exhaustivement par
// pkg/services/routes_auth_test.go, ce harnais teste la mécanique métier.
func userRouter(cfg *services.KeycloakConfig) chi.Router {
	r := chi.NewRouter()
	r.Post("/", func(w http.ResponseWriter, r *http.Request) { user.CreateUser(w, r, cfg) })
	r.Post("/import", func(w http.ResponseWriter, r *http.Request) { user.ImportUsers(w, r, cfg) })
	r.Route("/{userID}", func(r chi.Router) {
		r.With(user.UserUse).Get("/", func(w http.ResponseWriter, r *http.Request) { user.FetchUser(w, r, cfg) })
		r.With(user.UserUse).Put("/", func(w http.ResponseWriter, r *http.Request) { user.Update(w, r, cfg) })
		r.Delete("/", func(w http.ResponseWriter, r *http.Request) { user.Delete(w, r, cfg) })
	})
	r.Get("/", user.FetchAllUser)
	r.Get("/search", user.SearchUsers)
	return r
}

var (
	testRunID    = time.Now().UnixNano()
	emailCounter int64
)

// uniqueTestEmail fabrique une adresse dans le domaine réservé aux tests
// (@test.invalid), unique par appel dans l'exécution.
func uniqueTestEmail(t *testing.T) string {
	t.Helper()
	n := atomic.AddInt64(&emailCounter, 1)
	return fmt.Sprintf("user-test-%d-%d%s", testRunID, n, testMailDomain)
}

// userRequestDTO reflète userRequest (non exportée) côté production, pour
// construire les corps de requête depuis le paquet externe user_test.
type userRequestDTO struct {
	gen.User
	Roles []string `json:"roles"`
}

// userResponseDTO reflète userResponse (non exportée) côté production, pour
// décoder les réponses depuis le paquet externe user_test.
type userResponseDTO struct {
	gen.User
	Roles       []string `json:"roles"`
	EmailEnvoye *bool    `json:"email_envoye"`
}

func resetUsers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `TRUNCATE TABLE public."user" CASCADE`)
	require.NoError(t, err)
}

func decodeUser(t *testing.T, rec *httptest.ResponseRecorder) userResponseDTO {
	t.Helper()
	var out userResponseDTO
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), rec.Body.String())
	return out
}

// problemDetails décode l'enveloppe RFC 9457 (services.RenderError).
type problemDetails struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail"`
	Code   string `json:"code"`
	Errors map[string]struct {
		Motif string `json:"motif"`
	} `json:"errors"`
	Lignes []struct {
		Ligne  int    `json:"ligne"`
		Champ  string `json:"champ"`
		Motif  string `json:"motif"`
		Valeur string `json:"valeur"`
	} `json:"lignes"`
}

func decodeProblem(t *testing.T, rec *httptest.ResponseRecorder) problemDetails {
	t.Helper()
	var out problemDetails
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), rec.Body.String())
	return out
}

func countUsersByEmail(t *testing.T, pool *pgxpool.Pool, email string) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM public."user" WHERE email = $1`, email).Scan(&n))
	return n
}
