package groupe

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/groupe/gen"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
	"github.com/xuri/excelize/v2"
)

func ImportOneGroupe(w http.ResponseWriter, r *http.Request) {
	groupe := GetGroupeFromCtx(r)

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
		services.ServerError(w, r, err)
		return
	}

	queries := getQueriesFromCtx(r)
	result := ImportResult{}

	for _, row := range rows {
		if len(row) == 0 {
			continue
		}
		email := strings.TrimSpace(row[0])
		if email == "" {
			continue
		}

		user, err := queries.FetchUserByEmail(r.Context(), &email)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				result.NotFound = append(result.NotFound, email)
				continue
			}
			services.ServerError(w, r, err)
			return
		}

		if err := queries.AddUserToGroupe(r.Context(), gen.AddUserToGroupeParams{
			GroupeID: groupe.ID,
			UserID:   user.ID,
		}); err != nil {
			services.ServerError(w, r, err)
			return
		}
		result.Added++
	}

	slog.Debug("Import membres groupe", "groupe_id", groupe.ID, "added", result.Added, "not_found", len(result.NotFound))
	render.JSON(w, r, result)
}

type ImportResult struct {
	Added    int      `json:"added"`
	NotFound []string `json:"not_found"`
}

func RemoveUserFromGroupe(w http.ResponseWriter, r *http.Request) {
	groupe := GetGroupeFromCtx(r)

	userIDStr := getUserIDFromPath(r)
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		services.InvalidRequestError(w, r, "userID invalide", services.INVALID_PARAM, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	err = queries.RemoveUserFromGroupe(r.Context(), gen.RemoveUserFromGroupeParams{
		GroupeID: groupe.ID,
		UserID:   int32(userID),
	})
	if err != nil {
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Utilisateur retiré du groupe", "groupe_id", groupe.ID, "user_id", userID)

	w.WriteHeader(http.StatusNoContent)
}
