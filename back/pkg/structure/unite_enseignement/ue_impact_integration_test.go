package unite_enseignement

import (
	"context"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Correction A1 (17 septembre 2026) : l'UE a désormais son analyse d'impact.
// Elle compte les fiches syllabus de ses matières et ses liaisons de
// compétences, en plus de la cascade structurelle ; une UE sans donnée
// syllabus ne les mentionne pas.
func TestIntegration_UeDeleteImpact(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "uei")
	services.SeedSyllabusFixture(t, pool, fixture)

	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.UeID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	resp := services.DecodeDeleteImpact(t, rec)
	require.Len(t, resp.Items, 1)
	assert.Equal(t, fixture.UeID, resp.Items[0].ID)
	assert.Equal(t, "UE 1 uei", resp.Items[0].Name)

	counts := services.CascadeCounts(resp)
	assert.Equal(t, int64(1), counts["matiere"])
	assert.Equal(t, int64(1), counts["syllabus_matiere"], "la fiche de M1 suit sa matière")
	assert.Equal(t, int64(2), counts["controle"])
	assert.Equal(t, int64(3), counts["note"])
	assert.Equal(t, int64(1), counts["ue_competence"], "la liaison de U1 suit son UE")
	assert.NotContains(t, counts, "unite_enseignement", "l'UE visée n'est pas son propre descendant")
	assert.NotContains(t, counts, "bloc_competence", "le référentiel appartient à la promotion")
	assert.NotContains(t, counts, "jury_result")
	// Les deux réservations de la fixture portent la matière M1 : détachées, pas supprimées.
	require.Len(t, resp.Detached, 1)
	assert.Equal(t, "reservation", resp.Detached[0].Entity)
	assert.Equal(t, int64(2), resp.Detached[0].Count)
	assert.Empty(t, resp.Blocking)

	// Une UE sans matière ni liaison : aucune donnée liée.
	var ueVide int32
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO unite_enseignement (name, version, ects, periode_id) VALUES ('UE 2 uei', 1, 2, $1) RETURNING id`,
		fixture.PeriodeAutre).Scan(&ueVide))
	reqVide := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{ueVide})
	recVide := httptest.NewRecorder()
	DeleteImpact(recVide, reqVide)
	require.Equal(t, http.StatusOK, recVide.Code)
	respVide := services.DecodeDeleteImpact(t, recVide)
	assert.Empty(t, respVide.Cascade)
	assert.Empty(t, respVide.Detached)
	require.Len(t, respVide.Items, 1)

	// Un résultat de jury rattaché à l'UE tombe par cascade : compté ET bloquant
	// (lot correction-blocage-jury, 17 septembre 2026 — jusque-là compté sans
	// être retenu, le DELETE ne bloquait pas non plus).
	services.SeedJuryResult(t, pool, fixture)
	reqJury := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.UeID})
	recJury := httptest.NewRecorder()
	DeleteImpact(recJury, reqJury)
	require.Equal(t, http.StatusOK, recJury.Code)
	respJury := services.DecodeDeleteImpact(t, recJury)
	assert.Equal(t, int64(1), services.CascadeCounts(respJury)["jury_result"])
	require.Len(t, respJury.Blocking, 1)
	assert.Equal(t, services.ReasonJuryDelibere, respJury.Blocking[0].Reason)
	assert.Equal(t, int64(1), respJury.Blocking[0].Count, "une période délibérée touchée")
}

// Lot correction-blocage-jury (17 septembre 2026) : supprimer une UE dont la
// période est délibérée est refusé avec le 409 de la période — c'était le
// défaut consigné au lot A1 (fk_jury_result_ue en cascade, aucun contrôle).
func TestIntegration_UeDelete_JuryDelibere_Renvoie409(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "uej")
	services.SeedJuryResult(t, pool, fixture)
	ctx := context.Background()

	reqDel := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.UeID})
	recDel := httptest.NewRecorder()
	Delete(recDel, reqDel)
	require.Equal(t, http.StatusConflict, recDel.Code, recDel.Body.String())
	reason, count := services.DecodeConflitBlocage(t, recDel)
	assert.Equal(t, services.ReasonJuryDelibere, reason)
	assert.Equal(t, int64(1), count)

	// État intact : l'UE, ses notes et le résultat de jury sont toujours là.
	var ues, notes, jurys int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM unite_enseignement WHERE id = $1", fixture.UeID).Scan(&ues))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM note").Scan(&notes))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM jury_result").Scan(&jurys))
	assert.Equal(t, 1, ues)
	assert.Equal(t, 3, notes)
	assert.Equal(t, 1, jurys)

	// Une UE d'une période non délibérée reste supprimable, et en masse la
	// sélection est refusée en bloc dès qu'une UE touche un jury : rien ne part.
	var ueAutre int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO unite_enseignement (name, version, ects, periode_id) VALUES ('UE 2 uej', 1, 2, $1) RETURNING id`,
		fixture.PeriodeAutre).Scan(&ueAutre))
	reqMixte := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.UeID, ueAutre})
	recMixte := httptest.NewRecorder()
	Delete(recMixte, reqMixte)
	require.Equal(t, http.StatusConflict, recMixte.Code, recMixte.Body.String())
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM unite_enseignement").Scan(&ues))
	assert.Equal(t, 2, ues, "tout ou rien : l'UE non délibérée n'est pas supprimée non plus")

	reqOk := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{ueAutre})
	recOk := httptest.NewRecorder()
	Delete(recOk, reqOk)
	assert.Equal(t, http.StatusNoContent, recOk.Code, recOk.Body.String())
}
