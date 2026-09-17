package unite_enseignement

import (
	"context"
	"cyb-react/pkg/registre"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Invariant 5, fermé le 17 septembre 2026 : supprimer l'UE (matière, deux contrôles, trois notes)
// laisse un maillon note.delete par note emportée, dans la transaction qui
// supprime — jusque-là la cascade détruisait les notes sans preuve.
func TestIntegration_Delete_TraceLesNotesEmportees(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "tr-unite_enseignement")
	ctx := context.Background()

	var avant int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM registre WHERE op = 'note.delete'").Scan(&avant))

	rec := httptest.NewRecorder()
	Delete(rec, services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.UeID}))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	var apres, notesRestantes int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM registre WHERE op = 'note.delete'").Scan(&apres))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM note").Scan(&notesRestantes))
	assert.Equal(t, 3, apres-avant, "un maillon note.delete par note emportée")
	assert.Equal(t, 3-3, notesRestantes)

	res, err := registre.VerifierChaine(ctx, pool)
	require.NoError(t, err)
	assert.True(t, res.OK, "chaîne brisée : %s", res.Error)
}
