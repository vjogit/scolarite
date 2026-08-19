package note

import (
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/render"
	"github.com/xuri/excelize/v2"
)

type ImportFicheResult struct {
	ControleID int32 `json:"controle_id"`
	Created    int   `json:"created"`
	Updated    int   `json:"updated"`
}

func ImportFiche(w http.ResponseWriter, r *http.Request) {
	controleIDStr := r.URL.Query().Get("controle_id")
	if controleIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: controle_id", services.MISSING_PARAM, nil)
		return
	}
	expectedControleID, err := strconv.Atoi(controleIDStr)
	if err != nil || expectedControleID <= 0 {
		services.InvalidRequestError(w, r, "controle_id invalide", services.INVALID_PARAM, nil)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		services.InvalidRequestError(w, r, "fichier trop volumineux", services.FILE_TOO_LARGE, nil)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		services.InvalidRequestError(w, r, "fichier manquant (champ 'file')", services.FILE_MISSING, nil)
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".xlsx") {
		services.InvalidRequestError(w, r, "le fichier doit avoir l'extension .xlsx", services.INVALID_FILE_EXTENSION, nil)
		return
	}

	f, err := excelize.OpenReader(file)
	if err != nil {
		services.InvalidRequestError(w, r, "erreur de lecture du fichier Excel", services.INVALID_FILE, nil)
		return
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		services.InvalidRequestError(w, r, "le fichier ne contient aucune feuille", services.INVALID_FILE, nil)
		return
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// Ligne 6 (index 5) : "Controle id:  3"
	controleID, err := parseControleID(rows)
	if err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if controleID != int32(expectedControleID) {
		services.InvalidRequestError(w, r,
			fmt.Sprintf("le fichier correspond au contrôle %d, attendu %d", controleID, expectedControleID),
			services.INVALID_FILE, nil)
		return
	}

	pgCtx := services.GetPgCtx(r.Context())
	tx, err := pgCtx.Db.Begin(r.Context())
	if err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur début transaction: %v", err), services.NO_INFORMATION, nil)
		return
	}
	defer tx.Rollback(r.Context())

	queries := getQueriesFromCtx(r).WithTx(tx)

	// Barème lu une seule fois pour tout le fichier : la borne est ensuite
	// comparée en mémoire, ligne par ligne, sans jointure supplémentaire.
	bareme, err := fetchBareme(r.Context(), queries, controleID)
	if err != nil {
		services.InternalServerError(w, r, "barème du contrôle introuvable", services.NO_INFORMATION, nil)
		return
	}

	// Charger les notes existantes pour ce contrôle (map userID → note)
	existingNotes, err := queries.FetchNotesByControleID(r.Context(), controleID)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	noteByUserID := make(map[int32]gen.FetchNotesByControleIDRow, len(existingNotes))
	for _, n := range existingNotes {
		noteByUserID[n.UserID] = n
	}

	result := ImportFicheResult{ControleID: controleID}

	// Les données commencent à la ligne 14 (index 13), après l'en-tête ligne 13
	const firstDataRow = 13
	for offset, row := range rows[firstDataRow:] {
		if len(row) == 0 {
			continue
		}
		userID, err := strconv.Atoi(strings.TrimSpace(row[0]))
		if err != nil || userID <= 0 {
			continue // ligne non-données (stats, etc.)
		}

		noteVal, notEvaluated := parseNote(row)

		// Une seule ligne hors barème annule tout l'import : le rollback
		// différé garantit qu'aucune note du fichier n'est écrite. On désigne
		// la ligne et la valeur pour que le fichier soit corrigeable sans
		// relecture intégrale.
		if message := validateNote(noteVal, bareme); message != "" {
			ligne := firstDataRow + offset + 1 // numéro de ligne tel qu'affiché dans le tableur
			services.InvalidRequestError(w, r,
				fmt.Sprintf("Ligne %d : la note %s est refusée. %s. Aucune note n'a été importée.",
					ligne, formatDecimal(*noteVal), message),
				services.INVALID_FILE, nil)
			return
		}

		if existing, exists := noteByUserID[int32(userID)]; exists {
			_, err = queries.UpdateNote(r.Context(), gen.UpdateNoteParams{
				Note:         noteVal,
				Remarque:     existing.Remarque,
				UserID:       existing.UserID,
				IsValidated:  existing.IsValidated,
				NotEvaluated: notEvaluated,
				ID:           existing.ID,
				Version:      existing.Version,
			})
			if err != nil {
				slog.Error("import fiche : mise à jour impossible", "controle_id", controleID, "user_id", userID, "error", err)
				services.InternalServerError(w, r,
					fmt.Sprintf("échec de la mise à jour de la note de l'élève %d. Aucune note n'a été importée.", userID),
					services.NO_INFORMATION, nil)
				return
			}
			result.Updated++
		} else {
			_, err = queries.CreateNote(r.Context(), gen.CreateNoteParams{
				Note:         noteVal,
				Remarque:     nil,
				UserID:       int32(userID),
				ControleID:   controleID,
				IsValidated:  false,
				NotEvaluated: notEvaluated,
			})
			if err != nil {
				slog.Error("import fiche : création impossible", "controle_id", controleID, "user_id", userID, "error", err)
				services.InternalServerError(w, r,
					fmt.Sprintf("échec de la création de la note de l'élève %d. Aucune note n'a été importée.", userID),
					services.NO_INFORMATION, nil)
				return
			}
			result.Created++
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur commit transaction: %v", err), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Import fiche notes", "controle_id", controleID, "created", result.Created, "updated", result.Updated)
	render.JSON(w, r, result)
}

// parseControleID extrait l'ID du contrôle depuis la ligne "Controle id:  3" (index 5).
func parseControleID(rows [][]string) (int32, error) {
	const controleIDRow = 5
	if len(rows) <= controleIDRow || len(rows[controleIDRow]) == 0 {
		return 0, fmt.Errorf("ligne 'Controle id' introuvable (ligne %d)", controleIDRow+1)
	}

	idStr := strings.TrimSpace(rows[controleIDRow][1])
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("controle_id invalide: %q", idStr)
	}
	return int32(id), nil
}

// parseNote lit la colonne D (index 3) : nombre → note, vide → not_evaluated.
func parseNote(row []string) (*float32, bool) {
	if len(row) < 4 || strings.TrimSpace(row[3]) == "" {
		return nil, true // not_evaluated
	}
	val, err := strconv.ParseFloat(strings.TrimSpace(row[3]), 32)
	if err != nil {
		return nil, true // not_evaluated si non parseable
	}
	// Arrondi à 2 décimales
	rounded := float32(math.Round(val*100) / 100)
	return &rounded, false
}
