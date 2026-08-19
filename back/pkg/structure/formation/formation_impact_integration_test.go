package formation

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/formation/gen"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_FormationDeleteImpact(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "fmt")

	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.FormationID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	resp := services.DecodeDeleteImpact(t, rec)

	// Objets visés : nommés, sans attendre le serveur pour les décomptes.
	require.Len(t, resp.Items, 1)
	assert.Equal(t, fixture.FormationID, resp.Items[0].ID)
	assert.Equal(t, "Formation fmt", resp.Items[0].Name)

	// Décomptes conformes au jeu de données réellement inséré.
	counts := services.CascadeCounts(resp)
	assert.Equal(t, int64(2), counts["promotion"])
	assert.Equal(t, int64(1), counts["toeic"])
	assert.Equal(t, int64(1), counts["mobilite_internationale"])
	assert.Equal(t, int64(2), counts["option"])
	assert.Equal(t, int64(1), counts["groupe"])
	assert.Equal(t, int64(1), counts["groupe_user"])
	assert.Equal(t, int64(2), counts["periode"])
	assert.Equal(t, int64(1), counts["unite_enseignement"])
	assert.Equal(t, int64(1), counts["matiere"])
	assert.Equal(t, int64(2), counts["controle"])
	assert.Equal(t, int64(3), counts["note"])
	assert.Equal(t, int64(2), counts["reservation"])
	assert.Equal(t, int64(1), counts["reservation_intervenant"])
	assert.Equal(t, int64(1), counts["reservation_salle"])
	assert.Equal(t, int64(1), counts["reservation_groupe"])

	// Seules les entités non vides sont renvoyées.
	for _, entry := range resp.Cascade {
		assert.Greater(t, entry.Count, int64(0), "entité %s", entry.Entity)
	}
	assert.NotContains(t, counts, "jury_result")

	// Les deux réservations sont supprimées avec la formation : rien de détaché.
	assert.Empty(t, resp.Detached)
	assert.Empty(t, resp.Blocking)

	// Le libellé est accordé en nombre.
	for _, entry := range resp.Cascade {
		if entry.Entity == "unite_enseignement" {
			assert.Equal(t, "unité d'enseignement", entry.Label)
		}
		if entry.Entity == "note" {
			assert.Equal(t, "notes", entry.Label)
		}
	}

	// La suppression réelle vide bien tout ce qui a été annoncé.
	queries := gen.New(pool)
	require.NoError(t, queries.DeleteFormation(context.Background(), []int32{fixture.FormationID}))
	services.AssertTablesVides(t, pool, "formation", "promotion", "option", "periode",
		"unite_enseignement", "matiere", "controle", "note", "reservation", "groupe",
		"groupe_user", "toeic", "mobilite_internationale")
}

func TestIntegration_FormationDeleteImpact_BloqueParJury(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "fmtj")
	services.SeedJuryResult(t, pool, fixture)

	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.FormationID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	resp := services.DecodeDeleteImpact(t, rec)
	require.Len(t, resp.Blocking, 1)
	assert.Equal(t, services.ReasonJuryDelibere, resp.Blocking[0].Reason)
	assert.Contains(t, resp.Blocking[0].Message, "jury délibéré")
	assert.Equal(t, int64(1), services.CascadeCounts(resp)["jury_result"])

	// Le blocage est imposé côté serveur, pas seulement affiché.
	reqDel := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.FormationID})
	recDel := httptest.NewRecorder()
	Delete(recDel, reqDel)
	require.Equal(t, http.StatusConflict, recDel.Code, recDel.Body.String())
	assert.Contains(t, recDel.Body.String(), "BUSINESS_CONFLICT")

	var reste int
	require.NoError(t, pool.QueryRow(context.Background(),
		"SELECT count(*) FROM formation WHERE id = $1", fixture.FormationID).Scan(&reste))
	assert.Equal(t, 1, reste, "la formation ne doit pas avoir été supprimée")
}
