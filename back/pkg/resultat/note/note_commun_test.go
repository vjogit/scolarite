package note_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	// Remplacez par le chemin de votre package généré par sqlc
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
)

// setupTestDB initialise une transaction annulée à la fin du test
func setupTestDB(t *testing.T) (context.Context, pgx.Tx, *gen.Queries) {
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, services.IntegrationDBURL("postgres://postgres:root@localhost:5432/scolarite"))
	if err != nil {
		t.Skipf("base de test inaccessible : %v", err)
	}

	tx, err := conn.Begin(ctx)
	require.NoError(t, err)

	t.Cleanup(func() {
		tx.Rollback(ctx)
		conn.Close(ctx)
	})

	queries := gen.New(tx)
	return ctx, tx, queries
}
