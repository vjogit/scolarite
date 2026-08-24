package note

import (
	"bytes"
	"context"
	"cyb-react/pkg/services"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

// Ces tests exercent la borne haute des notes là où elle est réellement
// appliquée : dans les handlers Go. Une contrainte CHECK ne pouvant pas lire
// promotion.bareme, la base ne porte qu'un plafond d'absurdité — c'est donc le
// handler qu'il faut mettre sous tension, pas le schéma.

// requeteAvecPool construit une requête portant le pool dans son contexte,
// comme le ferait DatabaseMiddleware en production.
func requeteAvecPool(t *testing.T, pool *pgxpool.Pool, method, path string, corps any) *http.Request {
	t.Helper()
	body, err := json.Marshal(corps)
	require.NoError(t, err)
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req.WithContext(context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool}))
}

// corpsNote est la charge utile envoyée par l'écran de saisie.
type corpsNote struct {
	ID           int32    `json:"id"`
	Version      int32    `json:"version"`
	Note         *float32 `json:"note"`
	UserID       int32    `json:"user_id"`
	ControleID   int32    `json:"controle_id"`
	IsValidated  bool     `json:"is_validated"`
	NotEvaluated bool     `json:"not_evaluated"`
}

func ptr(v float32) *float32 { return &v }

func TestIntegration_CreateNote_BorneBareme(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	f := services.SeedStructureFixture(t, pool, "bareme")
	ctx := context.Background()

	// Un contrôle vierge : la fixture a déjà posé des notes sur les siens, or
	// (controle_id, user_id) est unique.
	var controleID int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ('Controle bareme', 1, 1, $1) RETURNING id`,
		f.MatiereID).Scan(&controleID))

	userID := f.UserIDs[0]

	// La fixture crée la promotion sans barème explicite : elle hérite du
	// défaut 20 posé par la migration sur les données existantes.
	var bareme float32
	require.NoError(t, pool.QueryRow(ctx, `SELECT bareme FROM promotion WHERE id = $1`, f.PromotionID).Scan(&bareme))
	require.Equal(t, float32(20), bareme, "le défaut de migration doit être 20")

	cas := []struct {
		nom           string
		note          *float32
		notEvaluated  bool
		statutAttendu int
		motifAttendu  string
	}{
		{nom: "note à 0", note: ptr(0), statutAttendu: http.StatusCreated},
		{nom: "note au barème exact", note: ptr(20), statutAttendu: http.StatusCreated},
		{nom: "note intermédiaire", note: ptr(15.5), statutAttendu: http.StatusCreated},
		{
			nom: "note à barème + 0.01", note: ptr(20.01),
			statutAttendu: http.StatusBadRequest,
			motifAttendu:  services.MotifNoteHorsBareme,
		},
		{
			// Le scénario nominal : 155 saisi pour 15,5.
			nom: "note manifestement hors barème", note: ptr(155),
			statutAttendu: http.StatusBadRequest,
			motifAttendu:  services.MotifNoteHorsBareme,
		},
		{
			nom: "note négative", note: ptr(-0.01),
			statutAttendu: http.StatusBadRequest,
			motifAttendu:  services.MotifNoteHorsBareme,
		},
		{
			// Non évalué : l'absence de note n'est pas une note hors barème.
			nom: "non évaluée sans note", note: nil, notEvaluated: true,
			statutAttendu: http.StatusCreated,
		},
	}

	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			_, err := pool.Exec(ctx, `DELETE FROM note WHERE controle_id = $1`, controleID)
			require.NoError(t, err)

			req := requeteAvecPool(t, pool, http.MethodPost, "/api/v0/resultat/note/controle", corpsNote{
				Note:         c.note,
				UserID:       userID,
				ControleID:   controleID,
				NotEvaluated: c.notEvaluated,
			})
			w := httptest.NewRecorder()
			CreateNote(w, req)

			require.Equal(t, c.statutAttendu, w.Code, "corps: %s", w.Body.String())
			if c.motifAttendu != "" {
				require.Contains(t, w.Body.String(), c.motifAttendu, "le motif doit désigner la borne")
				require.Contains(t, w.Body.String(), `"max":20`, "la borne voyage en donnée, pas en phrase")
			}

			var nb int
			require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM note WHERE controle_id = $1`, controleID).Scan(&nb))
			if c.statutAttendu == http.StatusCreated {
				require.Equal(t, 1, nb, "la note aurait dû être écrite")
			} else {
				require.Equal(t, 0, nb, "une note refusée ne doit rien écrire")
			}
		})
	}

	// Le barème est bien lu sur la promotion, et non figé à 20 dans le code.
	t.Run("barème non standard de la promotion", func(t *testing.T) {
		_, err := pool.Exec(ctx, `UPDATE promotion SET bareme = 100 WHERE id = $1`, f.PromotionID)
		require.NoError(t, err)

		_, err = pool.Exec(ctx, `DELETE FROM note WHERE controle_id = $1`, controleID)
		require.NoError(t, err)

		req := requeteAvecPool(t, pool, http.MethodPost, "/api/v0/resultat/note/controle", corpsNote{
			Note: ptr(75), UserID: userID, ControleID: controleID,
		})
		w := httptest.NewRecorder()
		CreateNote(w, req)
		require.Equal(t, http.StatusCreated, w.Code, "corps: %s", w.Body.String())

		_, err = pool.Exec(ctx, `DELETE FROM note WHERE controle_id = $1`, controleID)
		require.NoError(t, err)

		req = requeteAvecPool(t, pool, http.MethodPost, "/api/v0/resultat/note/controle", corpsNote{
			Note: ptr(100.01), UserID: userID, ControleID: controleID,
		})
		w = httptest.NewRecorder()
		CreateNote(w, req)
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), services.MotifNoteHorsBareme)
		require.Contains(t, w.Body.String(), `"max":100`, "la borne du barème relevé doit voyager en donnée")
	})
}

func TestIntegration_UpdateNote_BorneBareme(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	f := services.SeedStructureFixture(t, pool, "barupd")
	ctx := context.Background()

	var controleID int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ('Controle maj', 1, 1, $1) RETURNING id`,
		f.MatiereID).Scan(&controleID))

	var noteID, version int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO note (version, note, user_id, controle_id) VALUES (1, 10, $1, $2) RETURNING id, version`,
		f.UserIDs[0], controleID).Scan(&noteID, &version))

	// Le handler lit le contrôle depuis la note en base, via le middleware
	// NoteUse : on reproduit ce contexte plutôt que de se fier au corps.
	appelUpdate := func(t *testing.T, valeur *float32) *httptest.ResponseRecorder {
		t.Helper()
		req := requeteAvecPool(t, pool, http.MethodPut, fmt.Sprintf("/api/v0/resultat/note/controle/%d", noteID), corpsNote{
			ID: noteID, Version: version, Note: valeur, UserID: f.UserIDs[0], ControleID: controleID,
		})
		existante, err := getQueriesFromCtx(req).FetchNoteById(req.Context(), noteID)
		require.NoError(t, err)
		req = req.WithContext(setNoteFromCtx(req, &existante))

		w := httptest.NewRecorder()
		Update(w, req)
		return w
	}

	t.Run("mise à jour hors barème refusée", func(t *testing.T) {
		w := appelUpdate(t, ptr(25))
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), services.MotifNoteHorsBareme)
		require.Contains(t, w.Body.String(), `"max":20`, "la borne voyage en donnée, pas en phrase")

		var valeur float32
		require.NoError(t, pool.QueryRow(ctx, `SELECT note FROM note WHERE id = $1`, noteID).Scan(&valeur))
		require.Equal(t, float32(10), valeur, "la note en base ne doit pas avoir bougé")
	})

	t.Run("mise à jour au barème exact acceptée", func(t *testing.T) {
		w := appelUpdate(t, ptr(20))
		require.Equal(t, http.StatusOK, w.Code, "corps: %s", w.Body.String())

		var valeur float32
		require.NoError(t, pool.QueryRow(ctx, `SELECT note FROM note WHERE id = $1`, noteID).Scan(&valeur))
		require.Equal(t, float32(20), valeur)
	})
}

// construireFiche fabrique un classeur au format attendu par ImportFiche :
// l'identifiant du contrôle en ligne 6, les données à partir de la ligne 14
// (identifiant élève en colonne A, note en colonne D).
func construireFiche(t *testing.T, controleID int32, lignes [][2]string) []byte {
	t.Helper()
	f := excelize.NewFile()
	defer f.Close()
	feuille := f.GetSheetName(0)

	require.NoError(t, f.SetCellValue(feuille, "A6", "Controle id:"))
	require.NoError(t, f.SetCellValue(feuille, "B6", fmt.Sprintf("%d", controleID)))
	require.NoError(t, f.SetCellValue(feuille, "A13", "Id"))
	require.NoError(t, f.SetCellValue(feuille, "D13", "Note"))

	for i, ligne := range lignes {
		n := 14 + i
		require.NoError(t, f.SetCellValue(feuille, fmt.Sprintf("A%d", n), ligne[0]))
		require.NoError(t, f.SetCellValue(feuille, fmt.Sprintf("D%d", n), ligne[1]))
	}

	var buf bytes.Buffer
	require.NoError(t, f.Write(&buf))
	return buf.Bytes()
}

func requeteImport(t *testing.T, pool *pgxpool.Pool, controleID int32, contenu []byte) *http.Request {
	t.Helper()
	var corps bytes.Buffer
	writer := multipart.NewWriter(&corps)
	part, err := writer.CreateFormFile("file", "fiche.xlsx")
	require.NoError(t, err)
	_, err = io.Copy(part, bytes.NewReader(contenu))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/v0/resultat/note/fiche/import?controle_id=%d", controleID), &corps)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req.WithContext(context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool}))
}

func TestIntegration_ImportFiche_BorneBareme(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	f := services.SeedStructureFixture(t, pool, "barimp")
	ctx := context.Background()

	var controleID int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ('Controle import', 1, 1, $1) RETURNING id`,
		f.MatiereID).Scan(&controleID))

	compter := func(t *testing.T) int {
		t.Helper()
		var nb int
		require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM note WHERE controle_id = $1`, controleID).Scan(&nb))
		return nb
	}

	t.Run("une valeur hors barème n'écrit aucune ligne", func(t *testing.T) {
		_, err := pool.Exec(ctx, `DELETE FROM note WHERE controle_id = $1`, controleID)
		require.NoError(t, err)

		// La première ligne est valide : c'est bien tout l'import qui doit être
		// annulé, et pas seulement la ligne fautive.
		fiche := construireFiche(t, controleID, [][2]string{
			{fmt.Sprintf("%d", f.UserIDs[0]), "12"},
			{fmt.Sprintf("%d", f.UserIDs[1]), "155"},
		})

		w := httptest.NewRecorder()
		ImportFiche(w, requeteImport(t, pool, controleID, fiche))

		require.Equal(t, http.StatusBadRequest, w.Code, "corps: %s", w.Body.String())
		require.Contains(t, w.Body.String(), `"ligne":15`, "la ligne fautive doit être désignée")
		require.Contains(t, w.Body.String(), `"valeur":"155"`, "la valeur fautive doit être désignée")
		require.Equal(t, 0, compter(t), "aucune note ne doit avoir été écrite")
	})

	t.Run("un fichier entièrement dans le barème est importé", func(t *testing.T) {
		_, err := pool.Exec(ctx, `DELETE FROM note WHERE controle_id = $1`, controleID)
		require.NoError(t, err)

		fiche := construireFiche(t, controleID, [][2]string{
			{fmt.Sprintf("%d", f.UserIDs[0]), "12"},
			{fmt.Sprintf("%d", f.UserIDs[1]), "20"},
		})

		w := httptest.NewRecorder()
		ImportFiche(w, requeteImport(t, pool, controleID, fiche))

		require.Equal(t, http.StatusOK, w.Code, "corps: %s", w.Body.String())
		require.Equal(t, 2, compter(t))
	})
}
