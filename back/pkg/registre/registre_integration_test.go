package registre_test

// Tests d'intégration du registre chaîné, dans le style des tests corbeille :
// fixture partagée SeedStructureFixture, pool réel, handlers appelés en
// direct. Le package externe (_test) suit la convention du dépôt.
//
// Le registre n'a aucune FK : le TRUNCATE de la fixture ne l'atteint pas,
// chaque test le vide donc explicitement (viderRegistre).

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cyb-react/pkg/corbeille"
	"cyb-react/pkg/registre"
	registregen "cyb-react/pkg/registre/gen"
	"cyb-react/pkg/resultat/jury"
	"cyb-react/pkg/resultat/note"
	notegen "cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const subTest = "kc-agent-test"

func viderRegistre(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`TRUNCATE TABLE registre, registre_ancre, registre_temoin RESTART IDENTITY CASCADE`)
	require.NoError(t, err)
}

// newRequest pose dans le contexte le pool (comme DatabaseMiddleware) et le
// sub Keycloak (comme AuthMiddleware) — les handlers testés lisent les deux.
func newRequest(t *testing.T, pool *pgxpool.Pool, method, path string, body any) *http.Request {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	ctx := context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool})
	ctx = context.WithValue(ctx, services.KeycloakSubCtxKey, subTest)
	return req.WithContext(ctx)
}

// noteRouter monte les handlers de note sans le middleware de rôles : on teste
// la mécanique du registre, pas l'autorisation.
func noteRouter() chi.Router {
	r := chi.NewRouter()
	r.Post("/controle", note.CreateNote)
	r.Route("/controle/{noteID}", func(r chi.Router) {
		r.With(note.NoteUse).Put("/", note.Update)
	})
	r.Delete("/controle", note.Delete)
	return r
}

func maillons(t *testing.T, pool *pgxpool.Pool) []registregen.Registre {
	t.Helper()
	rows, err := registregen.New(pool).ListMaillonsBySeq(context.Background())
	require.NoError(t, err)
	return rows
}

func chaineIntacte(t *testing.T, pool *pgxpool.Pool) registre.VerifyChainResult {
	t.Helper()
	res, err := registre.VerifierChaine(context.Background(), pool)
	require.NoError(t, err)
	require.True(t, res.OK, "chaîne brisée : %s", res.Error)
	return res
}

func TestIntegration_Registre_NoteCreateUpdateDelete(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "reg1")
	viderRegistre(t, pool)

	// La fixture porte déjà une note par élève sur C1 (uk_note_controle_user) :
	// on repart de zéro pour dérouler le cycle complet sur un couple libre.
	_, err := pool.Exec(context.Background(), `DELETE FROM note`)
	require.NoError(t, err)

	router := noteRouter()
	valeur := float32(15.5)

	// Création.
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/controle", notegen.Note{
		Note:       &valeur,
		UserID:     fixture.UserIDs[1],
		ControleID: fixture.ControleID,
	}))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var creee notegen.Note
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &creee))

	// Modification : nouvelle valeur et remarque.
	nouvelle := float32(12.25)
	remarque := "rattrapage accordé"
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodPut,
		fmt.Sprintf("/controle/%d", creee.ID), notegen.Note{
			ID:         creee.ID,
			Version:    creee.Version,
			Note:       &nouvelle,
			Remarque:   &remarque,
			UserID:     fixture.UserIDs[1],
			ControleID: fixture.ControleID,
		}))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// Suppression en masse.
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest(t, pool, http.MethodDelete, "/controle",
		note.BulkDeleteRequest{IDs: []int32{creee.ID}}))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	// Trois maillons, dans l'ordre des opérations, chaînés et imputés.
	rows := maillons(t, pool)
	require.Len(t, rows, 3)

	assert.Equal(t, registre.OpNoteCreate, rows[0].Op)
	require.NotNil(t, rows[0].NewNote)
	assert.Equal(t, valeur, *rows[0].NewNote)
	assert.Nil(t, rows[0].OldNote, "pas d'ancienne valeur à la création")
	assert.Equal(t, registre.GenesisHash, rows[0].PrevHash)

	assert.Equal(t, registre.OpNoteUpdate, rows[1].Op)
	require.NotNil(t, rows[1].OldNote)
	assert.Equal(t, valeur, *rows[1].OldNote)
	require.NotNil(t, rows[1].NewNote)
	assert.Equal(t, nouvelle, *rows[1].NewNote)
	require.NotNil(t, rows[1].RemarqueHash)
	assert.Equal(t, registre.HashRemarque(&remarque), *rows[1].RemarqueHash,
		"la remarque n'entre que par son SHA-256")
	assert.Equal(t, rows[0].Hash, rows[1].PrevHash)

	assert.Equal(t, registre.OpNoteDelete, rows[2].Op)
	require.NotNil(t, rows[2].OldNote)
	assert.Equal(t, nouvelle, *rows[2].OldNote)
	assert.Nil(t, rows[2].NewNote, "pas de nouvelle valeur à la destruction")
	assert.Equal(t, rows[1].Hash, rows[2].PrevHash)

	for _, row := range rows {
		assert.Equal(t, subTest, row.AuthorSub, "chaque maillon est imputé (C. civ. 1366)")
		require.NotNil(t, row.NoteID)
		assert.Equal(t, creee.ID, *row.NoteID)
		assert.Equal(t, fixture.UserIDs[1], row.UserID)
	}

	res := chaineIntacte(t, pool)
	assert.Equal(t, int64(3), res.Maillons)
}

func TestIntegration_Registre_FalsificationDetectee(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "reg2")
	viderRegistre(t, pool)
	ctx := context.Background()

	_, err := pool.Exec(ctx, `DELETE FROM note`)
	require.NoError(t, err)

	valeur := float32(9.5)
	rec := httptest.NewRecorder()
	noteRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/controle", notegen.Note{
		Note:       &valeur,
		UserID:     fixture.UserIDs[0],
		ControleID: fixture.ControleID,
	}))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	chaineIntacte(t, pool)

	// Falsification directe en base : la valeur du maillon change sans que le
	// hash soit recalculé — le scénario que le registre existe pour détecter.
	_, err = pool.Exec(ctx, `UPDATE registre SET new_note = 18 WHERE seq = 1`)
	require.NoError(t, err)

	res, err := registre.VerifierChaine(ctx, pool)
	require.NoError(t, err)
	assert.False(t, res.OK, "la falsification doit briser la chaîne")
	assert.Equal(t, int64(1), res.BrokenAt)
}

func TestIntegration_Registre_AnnulationJury(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "reg3")
	viderRegistre(t, pool)
	services.SeedJuryResult(t, pool, fixture)

	r := chi.NewRouter()
	r.Delete("/periode/{periodeID}/deliberer/{userID}", jury.AnnulerDeliberation)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, newRequest(t, pool, http.MethodDelete,
		fmt.Sprintf("/periode/%d/deliberer/%d", fixture.PeriodeID, fixture.UserIDs[0]), nil))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	// Le résultat est détruit, le maillon jury.cancel porte les valeurs
	// annulées — le maillon reste autoportant.
	var restants int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM jury_result WHERE user_id = $1`, fixture.UserIDs[0]).Scan(&restants))
	assert.Zero(t, restants)

	rows := maillons(t, pool)
	require.Len(t, rows, 1)
	assert.Equal(t, registre.OpJuryCancel, rows[0].Op)
	assert.Equal(t, fixture.UserIDs[0], rows[0].UserID)
	require.NotNil(t, rows[0].PeriodeID)
	assert.Equal(t, fixture.PeriodeID, *rows[0].PeriodeID)
	require.NotNil(t, rows[0].Grade)
	assert.Equal(t, "A", *rows[0].Grade)
	assert.Equal(t, subTest, rows[0].AuthorSub)

	chaineIntacte(t, pool)
}

func TestIntegration_Registre_PurgeCorbeille(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "reg4")
	viderRegistre(t, pool)
	ctx := context.Background()

	marked, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacineFormation,
		[]int32{fixture.FormationID}, subTest)
	require.NoError(t, err)
	require.Equal(t, int64(1), marked)

	var opID int32
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM corbeille_operation`).Scan(&opID))

	r := chi.NewRouter()
	r.Delete("/{opID}", corbeille.Purger)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, newRequest(t, pool, http.MethodDelete, fmt.Sprintf("/%d", opID), nil))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	// Les 3 notes de la fixture sont détruites par cascade : chacune laisse un
	// maillon note.purge — aucune note ne disparaît sans que la chaîne dise
	// pourquoi.
	var notesRestantes int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM note`).Scan(&notesRestantes))
	assert.Zero(t, notesRestantes)

	rows := maillons(t, pool)
	require.Len(t, rows, 3)
	for _, row := range rows {
		assert.Equal(t, registre.OpNotePurge, row.Op)
		assert.Equal(t, subTest, row.AuthorSub)
		assert.NotNil(t, row.OldNote, "la valeur détruite est conservée au maillon")
	}

	chaineIntacte(t, pool)
}

func TestIntegration_Registre_EffacementUtilisateur(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "reg5")
	viderRegistre(t, pool)
	services.SeedJuryResult(t, pool, fixture)
	ctx := context.Background()
	eleve := fixture.UserIDs[0] // 2 notes + 1 résultat de jury

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)

	traces, err := registre.TracerEffacementUtilisateurs(ctx, tx, []int32{eleve}, subTest)
	require.NoError(t, err)
	assert.Equal(t, 3, traces)

	// La destruction de la correspondance (ligne user) emporte notes et
	// résultats par cascade — le registre, sans FK, y survit.
	_, err = tx.Exec(ctx, `DELETE FROM public."user" WHERE id = $1`, eleve)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))

	rows := maillons(t, pool)
	require.Len(t, rows, 3)
	ops := map[string]int{}
	for _, row := range rows {
		ops[row.Op]++
		assert.Equal(t, eleve, row.UserID)
	}
	assert.Equal(t, 2, ops[registre.OpNoteErase])
	assert.Equal(t, 1, ops[registre.OpJuryErase])

	// Extraction art. 15 : tous les maillons de l'élève, chaîne intacte alors
	// que ses identifiants ne résolvent plus.
	extraits, err := registregen.New(pool).ListMaillonsByUser(ctx, eleve)
	require.NoError(t, err)
	assert.Len(t, extraits, 3)

	chaineIntacte(t, pool)
}

// La sérialisation des écritures : deux transactions concurrentes ne doivent
// jamais partager le même prev_hash. Le verrou consultatif force la seconde à
// attendre le COMMIT de la première.
func TestIntegration_Registre_EcrituresConcurrentes(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "reg6")
	viderRegistre(t, pool)
	ctx := context.Background()

	const n = 8
	errs := make(chan error, n)
	for i := 0; i < n; i++ {
		go func(i int) {
			errs <- func() error {
				tx, err := pool.Begin(ctx)
				if err != nil {
					return err
				}
				defer tx.Rollback(ctx)
				valeur := float32(i)
				if _, _, err := registre.AppendNote(ctx, tx, registre.NoteEntry{
					Op:           registre.OpNoteCreate,
					NoteID:       int32(1000 + i),
					UserID:       fixture.UserIDs[0],
					ControleID:   fixture.ControleID,
					NewNote:      &valeur,
					RemarqueHash: registre.HashRemarque(nil),
					AuthorSub:    subTest,
					EventAt:      time.Now(),
				}); err != nil {
					return err
				}
				return tx.Commit(ctx)
			}()
		}(i)
	}
	for i := 0; i < n; i++ {
		require.NoError(t, <-errs)
	}

	rows := maillons(t, pool)
	require.Len(t, rows, n)
	chaineIntacte(t, pool)
}
