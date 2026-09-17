package jury

import (
	"context"
	"cyb-react/pkg/services"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Lot correction-blocage-jury (17 septembre 2026) : l'unique définition de
// « couvert par un jury délibéré », vérifiée depuis chacun des sept périmètres
// que les handlers de suppression lui présentent. Une seule période de la
// fixture est délibérée (PE1, par U1) : chaque périmètre qui la contient ou
// qui en descend compte 1, les autres 0.
func TestIntegration_CountPeriodesDeliberees_ToutPerimetre(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "blj")
	ctx := context.Background()

	// Un contrôle, une matière, une UE sous la période non délibérée PE2.
	var ueAutre, matiereAutre, controleAutre int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO unite_enseignement (name, version, ects, periode_id) VALUES ('UE 2 blj', 1, 2, $1) RETURNING id`,
		fixture.PeriodeAutre).Scan(&ueAutre))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO matiere (name, version, heure, coeff, unite_enseignement_id) VALUES ('Matiere 2 blj', 1, 10, 1, $1) RETURNING id`,
		ueAutre).Scan(&matiereAutre))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ('Controle 3 blj', 1, 1, $1) RETURNING id`,
		matiereAutre).Scan(&controleAutre))

	cas := []struct {
		nom       string
		perimetre Perimetre
		ids       []int32
		attendu   int64
	}{
		{"formation", PerimetreFormation, []int32{fixture.FormationID}, 1},
		{"promotion délibérée", PerimetrePromotion, []int32{fixture.PromotionID}, 1},
		{"promotion vide", PerimetrePromotion, []int32{fixture.PromotionVide}, 0},
		{"option délibérée", PerimetreOption, []int32{fixture.OptionID}, 1},
		{"option vide", PerimetreOption, []int32{fixture.OptionVide}, 0},
		{"période délibérée", PerimetrePeriode, []int32{fixture.PeriodeID}, 1},
		{"période autre", PerimetrePeriode, []int32{fixture.PeriodeAutre}, 0},
		{"UE de la période délibérée", PerimetreUE, []int32{fixture.UeID}, 1},
		{"UE de l'autre période", PerimetreUE, []int32{ueAutre}, 0},
		{"matière de la période délibérée", PerimetreMatiere, []int32{fixture.MatiereID}, 1},
		{"matière de l'autre période", PerimetreMatiere, []int32{matiereAutre}, 0},
		{"contrôle de la période délibérée", PerimetreControle, []int32{fixture.ControleID}, 1},
		{"contrôle de l'autre période", PerimetreControle, []int32{controleAutre}, 0},
		// En masse : deux matières de deux périodes, une seule délibérée → 1, pas 2.
		{"matières mêlées", PerimetreMatiere, []int32{fixture.MatiereID, matiereAutre}, 1},
		{"identifiant inconnu", PerimetreUE, []int32{999999}, 0},
	}

	// Avant délibération : rien ne bloque, quel que soit le périmètre.
	for _, c := range cas {
		nb, err := CountPeriodesDeliberees(ctx, pool, c.perimetre, c.ids)
		require.NoError(t, err, c.nom)
		assert.Equal(t, int64(0), nb, "%s : rien n'est délibéré", c.nom)
	}

	services.SeedJuryResult(t, pool, fixture)

	for _, c := range cas {
		nb, err := CountPeriodesDeliberees(ctx, pool, c.perimetre, c.ids)
		require.NoError(t, err, c.nom)
		assert.Equal(t, c.attendu, nb, c.nom)
	}

	// La période délibérée mise en corbeille sort du monde actif : le compte
	// suit les vues actives, comme les analyses d'impact — sa purge reste
	// bloquée par PurgeImpact.
	_, err := pool.Exec(ctx, `INSERT INTO corbeille_operation (racine_type, deleted_by) VALUES ('periode', 'test')`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE periode SET deleted_at = now(), delete_op_id = (SELECT max(id) FROM corbeille_operation) WHERE id = $1`, fixture.PeriodeID)
	require.NoError(t, err)
	nb, err := CountPeriodesDeliberees(ctx, pool, PerimetreUE, []int32{fixture.UeID})
	require.NoError(t, err)
	assert.Equal(t, int64(0), nb)
}
