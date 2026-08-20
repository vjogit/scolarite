package services_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"cyb-react/pkg/certification"
	"cyb-react/pkg/planning"
	"cyb-react/pkg/resultat"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure"
	"cyb-react/pkg/user"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// fakeAuth simule AuthMiddleware : il pose les rôles donnés dans le contexte
// sans vérifier de jeton. RequireRole, appliqué par les Route*, fait ensuite
// son travail normalement — c'est lui qui est testé ici.
func fakeAuth(roles []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), services.KeycloakRolesCtxKey, roles)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// newTestRouter monte les cinq groupes de routes comme main.go, avec des rôles
// injectés à la place du jeton. Recoverer transforme en 500 les paniques des
// handlers privés de base de données : seul le verdict d'autorisation compte.
func newTestRouter(roles []string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(fakeAuth(roles))
	// Un Postgres sans pool évite le log.Fatal de GetPgCtx : un handler qui
	// atteint la base panique et Recoverer en fait un 500, jamais un 403.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), services.PgCtxKey, &services.Postgres{})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})

	cfg := &services.KeycloakConfig{}
	r.Route("/api/v0/structure", structure.RouteStructure)
	r.Route("/api/v0/resultat", resultat.RouteResultat)
	r.Route("/api/v0/certification", certification.RouteToeic)
	r.Route("/api/v0/planning", planning.RoutePlanning)
	r.Route("/api/v0/user", func(r chi.Router) { user.RouteUser(r, cfg) })
	return r
}

func statut(t *testing.T, router http.Handler, method, path string) int {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec.Code
}

// Une route représentative par groupe et par régime (lecture / écriture).
var routesParGroupe = []struct {
	nom        string
	method     string
	path       string
	roleRequis string
}{
	{"structure lecture", http.MethodGet, "/api/v0/structure/formation/", services.RoleConsultation},
	{"structure écriture", http.MethodPost, "/api/v0/structure/formation/", services.RoleStructureEcriture},
	{"notes lecture", http.MethodGet, "/api/v0/resultat/note/grille", services.RoleConsultation},
	{"notes écriture", http.MethodPost, "/api/v0/resultat/note/fiche/import", services.RoleNotesEcriture},
	{"contrôles écriture", http.MethodPost, "/api/v0/resultat/controle/", services.RoleNotesEcriture},
	{"jury lecture", http.MethodGet, "/api/v0/resultat/jury/data/1", services.RoleConsultation},
	{"jury écriture", http.MethodPost, "/api/v0/resultat/jury/periode/1/deliberer/bulk", services.RoleJuryEcriture},
	{"certification lecture", http.MethodGet, "/api/v0/certification/toeic/", services.RoleConsultation},
	{"certification écriture", http.MethodPost, "/api/v0/certification/toeic/", services.RoleCertificationEcriture},
	{"programme écriture", http.MethodPost, "/api/v0/planning/reservation/", services.RoleProgrammeEcriture},
	{"salles lecture", http.MethodGet, "/api/v0/planning/salle/", services.RoleConsultation},
	{"salles écriture", http.MethodPost, "/api/v0/planning/salle/", services.RoleSallesEcriture},
	{"utilisateurs lecture", http.MethodGet, "/api/v0/user/", services.RoleConsultation},
	{"utilisateurs écriture", http.MethodPost, "/api/v0/user/", services.RoleUtilisateursEcriture},
}

// Le rôle requis ouvre l'accès ; son absence le ferme.
func TestRequireRoleParGroupe(t *testing.T) {
	for _, tc := range routesParGroupe {
		t.Run(tc.nom, func(t *testing.T) {
			avec := newTestRouter([]string{tc.roleRequis})
			if code := statut(t, avec, tc.method, tc.path); code == http.StatusForbidden || code == http.StatusUnauthorized {
				t.Errorf("%s %s : accès refusé (%d) alors que %s est porté", tc.method, tc.path, code, tc.roleRequis)
			}

			sans := newTestRouter([]string{"AUTRE_ROLE"})
			if code := statut(t, sans, tc.method, tc.path); code != http.StatusForbidden {
				t.Errorf("%s %s : attendu 403 sans %s, obtenu %d", tc.method, tc.path, tc.roleRequis, code)
			}
		})
	}
}

// Un porteur de CONSULTATION seul lit partout mais n'écrit nulle part :
// c'est la propriété « lecture globale, écritures ciblées ».
func TestConsultationSeule(t *testing.T) {
	router := newTestRouter([]string{services.RoleConsultation})
	for _, tc := range routesParGroupe {
		code := statut(t, router, tc.method, tc.path)
		if tc.roleRequis == services.RoleConsultation {
			if code == http.StatusForbidden || code == http.StatusUnauthorized {
				t.Errorf("%s %s : lecture refusée (%d) à CONSULTATION", tc.method, tc.path, code)
			}
		} else if code != http.StatusForbidden {
			t.Errorf("%s %s : écriture attendue refusée (403) pour CONSULTATION seul, obtenu %d", tc.method, tc.path, code)
		}
	}
}

// Propriété du composite ADMIN : Keycloak déplie ADMIN en la liste complète
// des rôles fonctionnels dans realm_access.roles (composite_roles dans
// keycloak.tf). Un jeton ainsi déplié doit ouvrir toutes les routes, sans que
// le code ne teste jamais ADMIN. Le dépliage réel par Keycloak est contrôlé de
// bout en bout à l'étape de vérification navigateur.
func TestAdminCompositeAccedeATout(t *testing.T) {
	rolesDuJetonAdmin := []string{
		services.RoleConsultation,
		services.RoleStructureEcriture,
		services.RoleNotesEcriture,
		services.RoleJuryEcriture,
		services.RoleProgrammeEcriture,
		services.RoleSallesEcriture,
		services.RoleCertificationEcriture,
		services.RoleUtilisateursEcriture,
	}
	router := newTestRouter(rolesDuJetonAdmin)
	for _, tc := range routesParGroupe {
		if code := statut(t, router, tc.method, tc.path); code == http.StatusForbidden || code == http.StatusUnauthorized {
			t.Errorf("%s %s : accès refusé (%d) au jeton ADMIN déplié", tc.method, tc.path, code)
		}
	}

	// Le rôle ADMIN brut, non déplié, n'ouvre rien : la propriété repose
	// entièrement sur le composite Keycloak, jamais sur un test du code.
	brut := newTestRouter([]string{services.RoleAdmin})
	for _, tc := range routesParGroupe {
		if code := statut(t, brut, tc.method, tc.path); code != http.StatusForbidden {
			t.Errorf("%s %s : ADMIN brut devrait être refusé (403), obtenu %d", tc.method, tc.path, code)
		}
	}
}
