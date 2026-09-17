package controle

import (
	"context"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Lot correction-blocage-jury (17 septembre 2026) : un contrôle porte les
// notes qui fondent un résultat de jury délibéré ; le supprimer sous jury est
// refusé comme la période. Le geste de correction légitime est l'annulation
// de la délibération, avec son maillon de registre.
func TestIntegration_ControleDelete_JuryDelibere_Renvoie409(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "ctj")
	ctx := context.Background()

	// Avant délibération, un contrôle se supprime avec ses notes.
	var controleLibre int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ('Controle 3 ctj', 1, 1, $1) RETURNING id`,
		fixture.MatiereID).Scan(&controleLibre))
	reqAvant := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{controleLibre})
	recAvant := httptest.NewRecorder()
	Delete(recAvant, reqAvant)
	require.Equal(t, http.StatusNoContent, recAvant.Code, recAvant.Body.String())

	services.SeedJuryResult(t, pool, fixture)

	reqDel := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.ControleID})
	recDel := httptest.NewRecorder()
	Delete(recDel, reqDel)
	require.Equal(t, http.StatusConflict, recDel.Code, recDel.Body.String())
	reason, count := services.DecodeConflitBlocage(t, recDel)
	assert.Equal(t, services.ReasonJuryDelibere, reason)
	assert.Equal(t, int64(1), count)

	var controles, notes int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM controle").Scan(&controles))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM note").Scan(&notes))
	assert.Equal(t, 2, controles, "les deux contrôles de la fixture sont intacts")
	assert.Equal(t, 3, notes)
}
