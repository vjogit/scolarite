package note

import (
	"bytes"
	"context"
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// La grille se verrouille sous jury délibéré (17 septembre 2026) : création,
// mise à jour et effacement d'une note d'un contrôle dont la période porte un
// résultat de jury sont refusés en 409 saisie_apres_deliberation, avant toute
// écriture — ni note, ni maillon. Avant délibération, les mêmes gestes
// passent ; le geste légitime pour rouvrir est l'annulation (jury.cancel).
func TestIntegration_NoteEcriture_JuryDelibere_Renvoie409(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "nbj")
	ctx := context.Background()
	avecPool := func(req *http.Request) *http.Request {
		return req.WithContext(context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool}))
	}
	corpsJSON := func(corps any) *http.Request {
		b, err := json.Marshal(corps)
		require.NoError(t, err)
		req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		return avecPool(req)
	}
	var noteID, version int32
	require.NoError(t, pool.QueryRow(ctx, `SELECT id, version FROM note WHERE controle_id = $1 AND user_id = $2`, fixture.ControleID, fixture.UserIDs[0]).Scan(&noteID, &version))
	var maillonsAvant int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM registre`).Scan(&maillonsAvant))

	// Avant délibération : la mise à jour passe (et pose son maillon).
	valeur := float32(15)
	rec := httptest.NewRecorder()
	Update(rec, corpsJSON(gen.Note{ID: noteID, Version: version, Note: &valeur, UserID: fixture.UserIDs[0], ControleID: fixture.ControleID}))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	version++

	services.SeedJuryResult(t, pool, fixture)

	rec = httptest.NewRecorder()
	Update(rec, corpsJSON(gen.Note{ID: noteID, Version: version, Note: &valeur, UserID: fixture.UserIDs[0], ControleID: fixture.ControleID}))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	reason, count := services.DecodeConflitBlocage(t, rec)
	assert.Equal(t, services.ReasonSaisieApresDeliberation, reason)
	assert.Equal(t, int64(1), count)

	rec = httptest.NewRecorder()
	autre := float32(9)
	CreateNote(rec, corpsJSON(gen.Note{Note: &autre, UserID: fixture.UserIDs[1], ControleID: fixture.ControleID}))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())

	rec = httptest.NewRecorder()
	Delete(rec, services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/controle", []int32{noteID}))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	reason, _ = services.DecodeConflitBlocage(t, rec)
	assert.Equal(t, services.ReasonSaisieApresDeliberation, reason)

	// Rien n'a bougé : ni la note, ni le registre au-delà du maillon d'avant.
	var noteApres float32
	var notes, maillonsApres int
	require.NoError(t, pool.QueryRow(ctx, `SELECT note FROM note WHERE id = $1`, noteID).Scan(&noteApres))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM note`).Scan(&notes))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM registre`).Scan(&maillonsApres))
	assert.Equal(t, float32(15), noteApres)
	assert.Equal(t, 3, notes)
	assert.Equal(t, maillonsAvant+1, maillonsApres, "un seul maillon : la mise à jour d'avant délibération")
}
