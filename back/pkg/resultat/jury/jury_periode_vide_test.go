package jury

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"cyb-react/pkg/resultat/jury/gen"
	"cyb-react/pkg/services"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

// setupJuryTx ouvre une transaction annulée en fin de test : les fixtures ne
// laissent rien derrière elles.
func setupJuryTx(t *testing.T) (context.Context, pgx.Tx) {
	t.Helper()

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, services.IntegrationDBURL("postgres://postgres:root@localhost:5432/scolarite"))
	if err != nil {
		t.Skipf("base de test inaccessible : %v", err)
	}

	tx, err := conn.Begin(ctx)
	require.NoError(t, err)

	t.Cleanup(func() {
		_ = tx.Rollback(ctx)
		_ = conn.Close(ctx)
	})

	return ctx, tx
}

// Une période fraîchement créée n'a aucune unité d'enseignement. Les tranches
// vides doivent alors se sérialiser en `[]` et non en `null` : le client
// déclare des tableaux et déréférence `hierarchy.ues` sans détour, si bien
// qu'un `null` faisait tomber tout l'écran de jury.
func TestPrepareJuryData_PeriodeSansUe(t *testing.T) {
	ctx, tx := setupJuryTx(t)

	var formationID, promotionID, optionID, periodeID int32

	require.NoError(t, tx.QueryRow(ctx,
		`INSERT INTO public.formation (name) VALUES ('Formation sans UE') RETURNING id`,
	).Scan(&formationID))

	require.NoError(t, tx.QueryRow(ctx, `
		INSERT INTO public.promotion (name, formation_id, echelle_gpa, echelle, debut, fin)
		VALUES ('Promo sans UE', $1, '{4.0, 3.5, 3.0, 2.5, 2.0, 0.0}', '{16.0, 14.0, 12.0, 10.0, 8.0}', '2024-09-01', '2025-06-30')
		RETURNING id`, formationID,
	).Scan(&promotionID))

	require.NoError(t, tx.QueryRow(ctx,
		`INSERT INTO public.option (name, promotion_id) VALUES ('Option sans UE', $1) RETURNING id`, promotionID,
	).Scan(&optionID))

	require.NoError(t, tx.QueryRow(ctx,
		`INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Période sans UE', $1, $2, $3) RETURNING id`,
		time.Now(), time.Now().AddDate(0, 1, 0), optionID,
	).Scan(&periodeID))

	donnees, err := NewJuryService(gen.New(tx), periodeID).PrepareJuryData(ctx)
	require.NoError(t, err)
	require.NotNil(t, donnees.Hierarchy)
	require.Equal(t, "Période sans UE", donnees.Hierarchy.Periode)
	require.Empty(t, donnees.Hierarchy.UEs)

	// L'assertion décisive porte sur le JSON : c'est lui que le client
	// consomme, et `require.Empty` ne distingue pas une tranche nil d'une
	// tranche vide alors que `json.Marshal` en fait `null` contre `[]`.
	brut, err := json.Marshal(donnees)
	require.NoError(t, err)

	var champs map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(brut, &champs))
	var hierarchie map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(champs["hierarchy"], &hierarchie))
	require.Equal(t, "[]", string(hierarchie["ues"]), "hierarchy.ues doit être un tableau")

	// Les autres collections du même document souffraient du même travers.
	for _, champ := range []string{"students", "rattrapages", "remplacements"} {
		require.NotEqual(t, "null", string(champs[champ]), "%s doit être un tableau", champ)
	}
}
