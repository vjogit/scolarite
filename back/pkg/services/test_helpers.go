package services

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// GetIntegrationDBPool initialise une connexion à la base de données pour les tests d'intégration.
// Elle gère la configuration (via variable d'environnement ou défaut), la connexion,
// et le nettoyage (fermeture) via t.Cleanup.
func GetIntegrationDBPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	// 1. Récupération de la configuration (Env var ou défaut Docker)
	connString := os.Getenv("TEST_DB_URL")
	if connString == "" {
		connString = "host=localhost port=5432 user=postgres password=root dbname=scolarite_tu sslmode=disable"
	}

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
