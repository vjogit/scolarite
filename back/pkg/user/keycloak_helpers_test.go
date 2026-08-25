package user_test

// Petit client Keycloak pour l'inspection et la purge côté test : le
// handler testé (user.CreateUser, user.Update, user.Delete) parle à
// Keycloak par lui-même, ce client-ci sert uniquement à VÉRIFIER l'état
// laissé dans Keycloak et à nettoyer. Même client de service
// (backend-api) que la production, jamais de mock de gocloak.

import (
	"context"
	"strings"
	"testing"

	"cyb-react/pkg/services"

	"github.com/Nerzal/gocloak/v13"
	"github.com/stretchr/testify/require"
)

type kcTestClient struct {
	client *gocloak.GoCloak
	token  string
	realm  string
}

func newKCTestClient(t *testing.T, cfg *services.KeycloakConfig) *kcTestClient {
	t.Helper()
	parts := strings.Split(cfg.Realm, "/")
	realm := parts[len(parts)-1]
	client := gocloak.NewClient(cfg.Host)
	token, err := client.LoginClient(context.Background(), cfg.Backend_client_id, cfg.Backend_client_secret, realm)
	require.NoError(t, err)
	return &kcTestClient{client: client, token: token.AccessToken, realm: realm}
}

// purgeTestUsers supprime tout compte Keycloak du domaine réservé aux tests
// — hygiène (b), appelée avant un test pour éliminer les survivants d'une
// exécution interrompue.
func (k *kcTestClient) purgeTestUsers(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	users, err := k.client.GetUsers(ctx, k.token, k.realm, gocloak.GetUsersParams{
		Email: gocloak.StringP(testMailDomain),
	})
	require.NoError(t, err)
	for _, u := range users {
		if u.Email != nil && strings.HasSuffix(*u.Email, testMailDomain) && u.ID != nil {
			_ = k.client.DeleteUser(ctx, k.token, k.realm, *u.ID)
		}
	}
}

func (k *kcTestClient) findByEmail(t *testing.T, email string) *gocloak.User {
	t.Helper()
	users, err := k.client.GetUsers(context.Background(), k.token, k.realm, gocloak.GetUsersParams{
		Email: gocloak.StringP(email),
		Exact: gocloak.BoolP(true),
	})
	require.NoError(t, err)
	if len(users) == 0 {
		return nil
	}
	return users[0]
}

func (k *kcTestClient) exists(t *testing.T, keycloakID string) bool {
	t.Helper()
	_, err := k.client.GetUserByID(context.Background(), k.token, k.realm, keycloakID)
	return err == nil
}

// rolesOf ne retient que les rôles applicatifs (AssignableRoles), comme
// fetchKeycloakRoles côté production : les rôles techniques du realm
// (offline_access, default-roles-*…) sont ignorés.
func (k *kcTestClient) rolesOf(t *testing.T, keycloakID string) []string {
	t.Helper()
	kcRoles, err := k.client.GetRealmRolesByUserID(context.Background(), k.token, k.realm, keycloakID)
	require.NoError(t, err)
	var roles []string
	for _, r := range kcRoles {
		if r.Name != nil && services.IsAssignableRole(*r.Name) {
			roles = append(roles, *r.Name)
		}
	}
	return roles
}

func (k *kcTestClient) deleteUser(keycloakID string) {
	_ = k.client.DeleteUser(context.Background(), k.token, k.realm, keycloakID)
}
