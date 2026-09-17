package matiere

import (
	"context"
	"cyb-react/pkg/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Correction A1 (17 septembre 2026) : la matière a désormais son analyse
// d'impact. Elle compte sa fiche syllabus (0 ou 1) en plus de ses contrôles
// et notes ; une matière sans fiche ne la mentionne pas.
func TestIntegration_MatiereDeleteImpact(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "mai")
	services.SeedSyllabusFixture(t, pool, fixture)

	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.MatiereID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	resp := services.DecodeDeleteImpact(t, rec)
	require.Len(t, resp.Items, 1)
	assert.Equal(t, fixture.MatiereID, resp.Items[0].ID)
	assert.Equal(t, "Matiere 1 mai", resp.Items[0].Name)

	counts := services.CascadeCounts(resp)
	assert.Equal(t, int64(1), counts["syllabus_matiere"], "la fiche suit sa matière")
	assert.Equal(t, int64(2), counts["controle"])
	assert.Equal(t, int64(3), counts["note"])
	assert.NotContains(t, counts, "matiere", "la matière visée n'est pas son propre descendant")
	assert.NotContains(t, counts, "ue_competence", "la liaison appartient à l'UE, pas à la matière")
	// Les deux réservations de la fixture portent M1 : détachées, pas supprimées.
	require.Len(t, resp.Detached, 1)
	assert.Equal(t, "reservation", resp.Detached[0].Entity)
	assert.Equal(t, int64(2), resp.Detached[0].Count)
	assert.Empty(t, resp.Blocking)

	// Une matière sans fiche ni contrôle : aucune donnée liée.
	var matiereVide int32
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO matiere (name, version, heure, coeff, unite_enseignement_id) VALUES ('Matiere 2 mai', 1, 10, 1, $1) RETURNING id`,
		fixture.UeID).Scan(&matiereVide))
	reqVide := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{matiereVide})
	recVide := httptest.NewRecorder()
	DeleteImpact(recVide, reqVide)
	require.Equal(t, http.StatusOK, recVide.Code)
	respVide := services.DecodeDeleteImpact(t, recVide)
	assert.Empty(t, respVide.Cascade)
	assert.Empty(t, respVide.Detached)

	// Sélection multiple : une seule requête, décomptes cumulés — une seule fiche.
	reqMulti := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.MatiereID, matiereVide})
	recMulti := httptest.NewRecorder()
	DeleteImpact(recMulti, reqMulti)
	require.Equal(t, http.StatusOK, recMulti.Code)
	respMulti := services.DecodeDeleteImpact(t, recMulti)
	assert.Len(t, respMulti.Items, 2)
	assert.Equal(t, int64(1), services.CascadeCounts(respMulti)["syllabus_matiere"])
}

// Lot correction-blocage-jury (17 septembre 2026) : les notes d'une matière
// fondent un résultat de jury délibéré (les bulletins se régénèrent depuis
// elles) — la matière se supprime comme la période, jamais sous jury.
func TestIntegration_MatiereDelete_JuryDelibere_Renvoie409(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "maj")
	services.SeedJuryResult(t, pool, fixture)
	ctx := context.Background()

	// L'analyse d'impact annonce le blocage…
	req := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{fixture.MatiereID})
	rec := httptest.NewRecorder()
	DeleteImpact(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	resp := services.DecodeDeleteImpact(t, rec)
	require.Len(t, resp.Blocking, 1)
	assert.Equal(t, services.ReasonJuryDelibere, resp.Blocking[0].Reason)
	assert.Equal(t, int64(1), resp.Blocking[0].Count)

	// … et le serveur le fait respecter.
	reqDel := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.MatiereID})
	recDel := httptest.NewRecorder()
	Delete(recDel, reqDel)
	require.Equal(t, http.StatusConflict, recDel.Code, recDel.Body.String())
	reason, count := services.DecodeConflitBlocage(t, recDel)
	assert.Equal(t, services.ReasonJuryDelibere, reason)
	assert.Equal(t, int64(1), count)

	var matieres, notes int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM matiere").Scan(&matieres))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM note").Scan(&notes))
	assert.Equal(t, 1, matieres)
	assert.Equal(t, 3, notes)

	// En masse, tout ou rien : une matière d'une autre période, non délibérée,
	// jointe à la matière bloquée, reste en place ; seule, elle part.
	var ueAutre, matiereAutre int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO unite_enseignement (name, version, ects, periode_id) VALUES ('UE 2 maj', 1, 2, $1) RETURNING id`,
		fixture.PeriodeAutre).Scan(&ueAutre))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO matiere (name, version, heure, coeff, unite_enseignement_id) VALUES ('Matiere 2 maj', 1, 10, 1, $1) RETURNING id`,
		ueAutre).Scan(&matiereAutre))
	reqMixte := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{fixture.MatiereID, matiereAutre})
	recMixte := httptest.NewRecorder()
	Delete(recMixte, reqMixte)
	require.Equal(t, http.StatusConflict, recMixte.Code, recMixte.Body.String())
	_, countMixte := services.DecodeConflitBlocage(t, recMixte)
	assert.Equal(t, int64(1), countMixte, "une seule période délibérée touchée")
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM matiere").Scan(&matieres))
	assert.Equal(t, 2, matieres)

	// L'impact d'une matière hors jury ne bloque pas.
	reqImpactOk := services.NewBulkIDsRequest(t, pool, http.MethodPost, "/delete-impact", []int32{matiereAutre})
	recImpactOk := httptest.NewRecorder()
	DeleteImpact(recImpactOk, reqImpactOk)
	require.Equal(t, http.StatusOK, recImpactOk.Code)
	assert.Empty(t, services.DecodeDeleteImpact(t, recImpactOk).Blocking)

	reqOk := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/bulk", []int32{matiereAutre})
	recOk := httptest.NewRecorder()
	Delete(recOk, reqOk)
	assert.Equal(t, http.StatusNoContent, recOk.Code, recOk.Body.String())
}
