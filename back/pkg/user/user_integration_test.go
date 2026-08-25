package user_test

// Tests d'intégration du domaine le plus privilégié : attribution des
// rôles, création sans mot de passe applicatif (C3), effacement RGPD croisé
// avec le registre chaîné. Contre les vraies dépendances de la composition
// locale (PostgreSQL, Keycloak, Mailpit) — gardés par l'environnement,
// jamais un échec quand une dépendance manque.

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cyb-react/pkg/services"
	"cyb-react/pkg/user/gen"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func strp(s string) *string { return &s }

func agentBody(email string, roles []string) userRequestDTO {
	return userRequestDTO{
		User: gen.User{
			FirstName:    strp("Prénom"),
			LastName:     strp("Nom"),
			Email:        strp(email),
			TypePersonne: "AGENT",
		},
		Roles: roles,
	}
}

// ── Rôles ────────────────────────────────────────────────────────────────

func TestIntegration_User_RoleHorsAllowlist_Rejete(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	cas := []struct {
		nom   string
		roles []string
	}{
		{"rôle inconnu", []string{"SUPER_ADMIN"}},
		{"chaîne vide", []string{""}},
		{"casse différente", []string{"admin"}},
		{"mélange légitime et intrus", []string{"CONSULTATION", "SUPER_ADMIN"}},
	}

	router := userRouter(cfg)
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			email := uniqueTestEmail(t)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/", agentBody(email, c.roles)))
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
			prob := decodeProblem(t, rec)
			assert.Equal(t, "INVALID_PARAM", prob.Code)

			// Aucune écriture, ni en base ni dans Keycloak.
			assert.Zero(t, countUsersByEmail(t, pool, email))
			assert.Nil(t, kc.findByEmail(t, email))
		})
	}
}

func TestIntegration_User_CreationAgent_RolesEtCourriel(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	mail := newMailpitClient(t)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	email := uniqueTestEmail(t)
	mail.purge(t, `to:"`+email+`"`)
	t.Cleanup(func() { mail.purge(t, `to:"`+email+`"`) })

	roles := []string{"CONSULTATION", "NOTES_ECRITURE"}
	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/", agentBody(email, roles)))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	out := decodeUser(t, rec)
	require.NotNil(t, out.KeycloakID)
	require.NotNil(t, out.EmailEnvoye)
	assert.True(t, *out.EmailEnvoye)
	assert.ElementsMatch(t, roles, out.Roles)

	t.Cleanup(func() { kc.deleteUser(*out.KeycloakID) })

	// Les rôles sont bien portés par Keycloak, relus indépendamment de la
	// réponse HTTP.
	assert.ElementsMatch(t, roles, kc.rolesOf(t, *out.KeycloakID))

	// Aucun mot de passe n'est jamais défini par l'application : le seul
	// canal est le courriel UPDATE_PASSWORD, reçu dans Mailpit.
	msg := mail.waitForMessageTo(t, email, 5*time.Second)
	assert.Contains(t, msg.To[0].Address, email)
	assert.Contains(t, msg.Text+msg.HTML, "key=", "le courriel devrait porter un lien d'action Keycloak")
}

func TestIntegration_User_CreationEleve_SansCompteKeycloakNiRole(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	resetUsers(t, pool)

	router := userRouter(cfg)

	// Un élève avec des rôles est refusé avant toute écriture.
	rec := httptest.NewRecorder()
	body := userRequestDTO{
		User:  gen.User{FirstName: strp("Elève"), LastName: strp("Test"), TypePersonne: "ELEVE"},
		Roles: []string{"CONSULTATION"},
	}
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/", body))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "INVALID_PARAM", decodeProblem(t, rec).Code)

	// Un élève sans rôle est créé, sans compte Keycloak — pas d'email requis.
	rec = httptest.NewRecorder()
	body = userRequestDTO{User: gen.User{FirstName: strp("Elève"), LastName: strp("Test"), TypePersonne: "ELEVE"}}
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/", body))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	out := decodeUser(t, rec)
	assert.Nil(t, out.KeycloakID)
	assert.Nil(t, out.EmailEnvoye)
}

func TestIntegration_User_CreationEmailDoublon(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	email := uniqueTestEmail(t)
	router := userRouter(cfg)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/", agentBody(email, nil)))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	premier := decodeUser(t, rec)
	t.Cleanup(func() { kc.deleteUser(*premier.KeycloakID) })
	t.Cleanup(func() { bestEffortPurgeMail(email) })

	// Doublon : code de validation, pas un 500 ; le premier compte survit.
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/", agentBody(email, nil)))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	prob := decodeProblem(t, rec)
	assert.Equal(t, "VALIDATION_ERROR", prob.Code)
	require.Contains(t, prob.Errors, "email")
	assert.Equal(t, services.MotifValeurDejaUtilisee, prob.Errors["email"].Motif)

	assert.Equal(t, 1, countUsersByEmail(t, pool, email))
	assert.True(t, kc.exists(t, *premier.KeycloakID))
}

// ── Panne partielle (c) — caractérisation, sans correction ────────────────

// Le compte Keycloak est créé avant l'écriture DB. Si celle-ci échoue, le
// code tente un rollback (deleteKeycloakUser) : ce test fige le cas nominal,
// où ce rollback réussit. Si deleteKeycloakUser échoue à son tour, son
// erreur est aujourd'hui jetée silencieusement (`_ = ...`, pkg/user/user.go)
// sans log ni signal — non testé ici : le forcer exigerait de casser la
// connexion Keycloak au milieu du test, ce que le brief exclut (pas de mock
// fragile de l'API d'administration).
func TestIntegration_User_PannePartielle_Create_RollbackKeycloakSurEchecDB(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	email := uniqueTestEmail(t)
	// sendPasswordEmail s'exécute AVANT l'insertion DB (user.go) : même sur
	// ce chemin de rollback, un vrai courriel part réellement — à purger.
	t.Cleanup(func() { bestEffortPurgeMail(email) })

	// Une ligne DB porte déjà cet email — Keycloak, lui, ne le connaît pas
	// encore : la création Keycloak va donc réussir avant que l'insertion DB
	// n'échoue sur la contrainte d'unicité.
	_, err := pool.Exec(context.Background(),
		`INSERT INTO public."user" (version, "firstName", "lastName", email, type_personne) VALUES (1, 'Occ', 'Upé', $1, 'AGENT')`,
		email)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/", agentBody(email, nil)))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "VALIDATION_ERROR", decodeProblem(t, rec).Code)

	// Le rollback a fonctionné : aucun compte orphelin dans Keycloak.
	assert.Nil(t, kc.findByEmail(t, email), "le compte Keycloak créé avant l'échec DB devrait avoir été supprimé (rollback)")
}

// createTestAgent crée un agent via le handler HTTP (le seul chemin qui
// crée un vrai compte Keycloak avec le mot de passe applicatif absent) et
// programme sa suppression Keycloak en fin de test. La ligne DB, elle, est
// éliminée par le TRUNCATE du test suivant (resetUsers / SeedStructureFixture).
func createTestAgent(t *testing.T, pool *pgxpool.Pool, cfg *services.KeycloakConfig, kc *kcTestClient, roles []string) userResponseDTO {
	t.Helper()
	email := uniqueTestEmail(t)
	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/", agentBody(email, roles)))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	out := decodeUser(t, rec)
	t.Cleanup(func() { kc.deleteUser(*out.KeycloakID) })

	// Chaque agent créé déclenche un vrai courriel UPDATE_PASSWORD dans
	// Mailpit (hygiène (b)) : le purger même quand le test n'en fait rien —
	// tous les appelants de createTestAgent n'assertent pas sur la boîte.
	// best-effort, direct (pas newMailpitClient : t.Skip n'a pas sa place
	// dans un t.Cleanup).
	if out.EmailEnvoye != nil && *out.EmailEnvoye {
		t.Cleanup(func() { bestEffortPurgeMail(email) })
	}
	return out
}

func updateBody(agent userResponseDTO, roles []string) userRequestDTO {
	return userRequestDTO{
		User: gen.User{
			ID:           agent.ID,
			Version:      agent.Version,
			FirstName:    agent.FirstName,
			LastName:     agent.LastName,
			Email:        agent.Email,
			TypePersonne: agent.TypePersonne,
		},
		Roles: roles,
	}
}

func TestIntegration_User_Update_InjectionRoleRejetee(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	agent := createTestAgent(t, pool, cfg, kc, []string{"CONSULTATION"})

	rec := httptest.NewRecorder()
	body := updateBody(agent, []string{"CONSULTATION", "SUPER_ADMIN"})
	userRouter(cfg).ServeHTTP(rec, newRequest(t, pool, http.MethodPut, fmt.Sprintf("/%d", agent.ID), body))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Equal(t, "INVALID_PARAM", decodeProblem(t, rec).Code)

	// Rejeté avant tout appel Keycloak : les rôles existants sont inchangés.
	assert.ElementsMatch(t, []string{"CONSULTATION"}, kc.rolesOf(t, *agent.KeycloakID))
}

func TestIntegration_User_Update_RolesAjoutEtRetrait(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	agent := createTestAgent(t, pool, cfg, kc, []string{"CONSULTATION"})
	router := userRouter(cfg)

	// Retire CONSULTATION, ajoute NOTES_ECRITURE et JURY_ECRITURE : l'état
	// final doit être exact, ni cumul fantôme ni perte.
	rec := httptest.NewRecorder()
	body := updateBody(agent, []string{"NOTES_ECRITURE", "JURY_ECRITURE"})
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodPut, fmt.Sprintf("/%d", agent.ID), body))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	agent = decodeUser(t, rec)
	assert.ElementsMatch(t, []string{"NOTES_ECRITURE", "JURY_ECRITURE"}, kc.rolesOf(t, *agent.KeycloakID))

	// Liste vide explicite : tous les rôles applicatifs sont retirés.
	rec = httptest.NewRecorder()
	body = updateBody(agent, []string{})
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodPut, fmt.Sprintf("/%d", agent.ID), body))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	agent = decodeUser(t, rec)
	assert.Empty(t, kc.rolesOf(t, *agent.KeycloakID))
}

func TestIntegration_User_Update_RolesNilNeTouchePasAuxRoles(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	agent := createTestAgent(t, pool, cfg, kc, []string{"CONSULTATION", "NOTES_ECRITURE"})

	// Corps sans le champ "roles" du tout (à la différence d'une liste vide) :
	// construit à la main, agentBody/updateBody sérialiseraient toujours la clé.
	raw := []byte(fmt.Sprintf(
		`{"id":%d,"version":%d,"firstName":"Prénom Modifié","lastName":"Nom","type_personne":"AGENT"}`,
		agent.ID, agent.Version))
	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, newRawRequest(t, pool, http.MethodPut, fmt.Sprintf("/%d", agent.ID), raw))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	assert.ElementsMatch(t, []string{"CONSULTATION", "NOTES_ECRITURE"}, kc.rolesOf(t, *agent.KeycloakID))
}

// Défaut réel signalé, non corrigé : updateKeycloakUser s'exécute AVANT
// l'écriture DB (contrairement à CreateUser, qui rollback Keycloak sur échec
// DB). Un conflit de version laisse donc les rôles/infos Keycloak modifiés
// alors que le client reçoit une erreur qui laisse croire que rien n'a
// changé.
func TestIntegration_User_PannePartielle_Update_KeycloakModifieMalgreConflitDB(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	agent := createTestAgent(t, pool, cfg, kc, []string{"CONSULTATION"})

	body := updateBody(agent, []string{"NOTES_ECRITURE", "JURY_ECRITURE"})
	body.Version = 999 // version erronée : conflit optimiste côté DB

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, newRequest(t, pool, http.MethodPut, fmt.Sprintf("/%d", agent.ID), body))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Equal(t, "OPTIMISTIC_LOCKING_FAILURE", decodeProblem(t, rec).Code)

	// La DB n'a pas bougé…
	current := fetchUser(t, pool, agent.ID)
	assert.Equal(t, agent.Version, current.Version)

	// … mais Keycloak, lui, a déjà reçu les nouveaux rôles : c'est le défaut.
	assert.ElementsMatch(t, []string{"NOTES_ECRITURE", "JURY_ECRITURE"}, kc.rolesOf(t, *agent.KeycloakID),
		"Keycloak porte les rôles de la requête en conflit alors que la DB n'a jamais changé — divergence non rattrapée")
}

func fetchUser(t *testing.T, pool *pgxpool.Pool, id int32) gen.User {
	t.Helper()
	var u gen.User
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT id, version, "firstName", "lastName", email, keycloak_id, type_personne FROM public."user" WHERE id = $1`, id).
		Scan(&u.ID, &u.Version, &u.FirstName, &u.LastName, &u.Email, &u.KeycloakID, &u.TypePersonne))
	return u
}
