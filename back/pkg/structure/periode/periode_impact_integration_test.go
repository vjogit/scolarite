package periode

import (
	"context"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_PeriodeDeleteImpact(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "per")

	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.PeriodeID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	resp := services.DecodeDeleteImpact(t, rec)

	require.Len(t, resp.Items, 1)
	assert.Equal(t, "Periode 1 per", resp.Items[0].Name)

	counts := services.CascadeCounts(resp)
	assert.Equal(t, int64(1), counts["unite_enseignement"])
	assert.Equal(t, int64(1), counts["matiere"])
	assert.Equal(t, int64(2), counts["controle"])
	assert.Equal(t, int64(3), counts["note"])
	assert.Equal(t, int64(1), counts["reservation"], "seule la réservation de cette période est supprimée")
	assert.Equal(t, int64(1), counts["reservation_intervenant"])
	assert.Equal(t, int64(1), counts["reservation_salle"])
	assert.Equal(t, int64(1), counts["reservation_groupe"])
	assert.NotContains(t, counts, "groupe", "les groupes dépendent de l'option, pas de la période")

	// ON DELETE SET NULL : la réservation de l'autre période perd sa matière
	// sans être supprimée — elle est signalée à part, pas comptée en cascade.
	require.Len(t, resp.Detached, 1)
	assert.Equal(t, "reservation", resp.Detached[0].Entity)
	assert.Equal(t, int64(1), resp.Detached[0].Count)
	assert.Empty(t, resp.Blocking)

	// Vérification du comportement réel de la base.
	_, err := pool.Exec(context.Background(), "DELETE FROM periode WHERE id = $1", fixture.PeriodeID)
	require.NoError(t, err)

	var matiereID *int32
	require.NoError(t, pool.QueryRow(context.Background(),
		"SELECT matiere_id FROM reservation WHERE id = $1", fixture.ReservationR2).Scan(&matiereID))
	assert.Nil(t, matiereID, "la réservation survit, détachée de sa matière")

	var nbReservations int
	require.NoError(t, pool.QueryRow(context.Background(), "SELECT count(*) FROM reservation").Scan(&nbReservations))
	assert.Equal(t, 1, nbReservations)
}

func TestIntegration_PeriodeDelete_JuryDelibere_Renvoie409(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "perj")
	services.SeedJuryResult(t, pool, fixture)

	// L'impact signale le blocage…
	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.PeriodeID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	resp := services.DecodeDeleteImpact(t, rec)
	require.Len(t, resp.Blocking, 1)
	assert.Equal(t, services.ReasonJuryDelibere, resp.Blocking[0].Reason)

	// … et le serveur le fait respecter.
	reqDel := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.PeriodeID})
	recDel := httptest.NewRecorder()
	Delete(recDel, reqDel)

	require.Equal(t, http.StatusConflict, recDel.Code, recDel.Body.String())
	assert.Contains(t, recDel.Body.String(), "BUSINESS_CONFLICT")

	var reste int
	require.NoError(t, pool.QueryRow(context.Background(),
		"SELECT count(*) FROM periode WHERE id = $1", fixture.PeriodeID).Scan(&reste))
	assert.Equal(t, 1, reste, "la période délibérée ne doit pas être supprimée")

	// Une période non délibérée reste supprimable.
	reqOk := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.PeriodeAutre})
	recOk := httptest.NewRecorder()
	Delete(recOk, reqOk)
	assert.Equal(t, http.StatusNoContent, recOk.Code, recOk.Body.String())
}
