package note_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	// Remplacez par le chemin de votre package généré par sqlc
	"cyb-react/pkg/resultat/note/gen"
)

// setupTestDB initialise une transaction annulée à la fin du test
func setupTestDB(t *testing.T) (context.Context, pgx.Tx, *gen.Queries) {
	ctx := context.Background()
	// Remplacez par votre chaîne de connexion de test
	conn, err := pgx.Connect(ctx, "postgres://postgres:root@localhost:5432/scolarite")
	require.NoError(t, err)

	tx, err := conn.Begin(ctx)
	require.NoError(t, err)

	t.Cleanup(func() {
		tx.Rollback(ctx)
		conn.Close(ctx)
	})

	queries := gen.New(tx)
	return ctx, tx, queries
}
