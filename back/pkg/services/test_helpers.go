package services

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/Nerzal/gocloak/v13"
	"github.com/jackc/pgx/v5/pgxpool"
)

// IntegrationDBURL retourne la chaîne de connexion des tests d'intégration :
// TEST_DB_URL si elle est renseignée, sinon le défaut fourni par l'appelant.
//
// Selon la façon dont l'infra locale est démarrée, PostgreSQL n'est pas
// forcément publié sur localhost — il peut n'être joignable que sur le réseau
// Docker. Une seule variable d'environnement suffit alors à réorienter tous
// les tests, quel que soit leur défaut historique.
func IntegrationDBURL(defaut string) string {
	if url := os.Getenv("TEST_DB_URL"); url != "" {
		return url
	}
	return defaut
}

// GetIntegrationDBPool initialise une connexion à la base de données pour les tests d'intégration.
// Elle gère la configuration (via variable d'environnement ou défaut), la connexion,
// et le nettoyage (fermeture) via t.Cleanup.
func GetIntegrationDBPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	// 1. Récupération de la configuration (Env var ou défaut Docker)
	connString := IntegrationDBURL("host=localhost port=5432 user=postgres password=root dbname=scolarite_tu sslmode=disable")

	// 2. Connexion
	pool, err := pgxpool.New(context.Background(), connString)
	if err != nil {
		t.Skipf("Skipping integration test: impossible de se connecter à la DB (%v)", err)
		return nil
	}

	// 3. Vérification (Ping) et Nettoyage automatique
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Skipf("Skipping integration test: DB non accessible (%v)", err)
		return nil
	}

	t.Cleanup(func() {
		pool.Close()
	})

	return pool
}

// envOr retourne la variable d'environnement nommée, ou le défaut si elle est
// absente ou vide.
func envOr(key, defaut string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaut
}

// GetIntegrationKeycloakConfig construit la configuration Keycloak des tests
// d'intégration à partir des variables d'environnement de la composition
// locale, avec les mêmes défauts que le make local
// (infra/env/config-local.env). Le client de service utilisé est
// `backend-api`, celui-là même dont dépend le code de production
// (newKeycloakAdminClient) : les tests empruntent le chemin réel, sans mock
// de l'API d'administration.
//
// KC_BACKEND_CLIENT_SECRET n'est jamais dans l'environnement d'un simple
// `go test` — le fichier de secrets n'est source que par le makefile — d'où
// le t.Skip explicite plutôt qu'un défaut en dur : ce secret est tourné à
// chaque `terraform apply` et n'a pas vocation à vivre dans le code.
func GetIntegrationKeycloakConfig(t *testing.T) *KeycloakConfig {
	t.Helper()

	secret := os.Getenv("KC_BACKEND_CLIENT_SECRET")
	if secret == "" {
		t.Skip("Skipping integration test: KC_BACKEND_CLIENT_SECRET absent de l'environnement (voir infra/env/secrets-local.env)")
		return nil
	}

	realm := envOr("KC_REALM", "RealmCybScolarite")
	cfg := &KeycloakConfig{
		Host:                  envOr("KC_TEST_HOST", "http://"+envOr("KC_INTERNAL_HOSTNAME", "10.20.2.2")+":8080"+envOr("KC_HTTP_RELATIVE_PATH", "/auth")),
		Realm:                 "realms/" + realm,
		Backend_client_id:     envOr("KC_BACKEND_CLIENT_ID", "backend-api"),
		Backend_client_secret: secret,
	}

	client := gocloak.NewClient(cfg.Host)
	if _, err := client.LoginClient(context.Background(), cfg.Backend_client_id, cfg.Backend_client_secret, strings.TrimPrefix(cfg.Realm, "realms/")); err != nil {
		t.Skipf("Skipping integration test: Keycloak non accessible (%v)", err)
		return nil
	}

	return cfg
}
