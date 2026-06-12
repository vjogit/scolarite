package groupe

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/groupe/gen"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
	"github.com/xuri/excelize/v2"
)

// ImportMultiGroupesResult résume le résultat de l'import de plusieurs groupes.
type ImportMultiGroupesResult struct {
	Groupes []ImportGroupeResult `json:"groupes"`
}

// ImportGroupeResult résume le résultat de l'import d'un groupe (une feuille).
type ImportGroupeResult struct {
	Nom      string   `json:"nom"`
	GroupeID int32    `json:"groupe_id"`
	Added    int      `json:"added"`
	NotFound []string `json:"not_found"`
}

func ImportMultiGroupes(w http.ResponseWriter, r *http.Request) {
	optionIDStr := r.URL.Query().Get("option_id")
	if optionIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: option_id", services.MISSING_PARAM, nil)
		return
	}
	optionID, err := strconv.Atoi(optionIDStr)
	if err != nil {
		services.InvalidRequestError(w, r, "option_id invalide", services.INVALID_PARAM, nil)
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

	pgCtx := services.GetPgCtx(r.Context())
	tx, err := pgCtx.Db.Begin(r.Context())
	if err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur début transaction: %v", err), services.NO_INFORMATION, nil)
		return
	}
	defer tx.Rollback(r.Context())

	queries := getQueriesFromCtx(r).WithTx(tx)
	result := ImportMultiGroupesResult{}

	for _, sheet := range sheets {
		rows, err := f.GetRows(sheet)
		if err != nil {
			services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
			return
		}
		if len(rows) == 0 {
			continue
		}

		// Ligne 0 : nom du groupe
		nomGroupe := strings.TrimSpace(rows[0][0])
		if nomGroupe == "" {
			nomGroupe = sheet
		}

		groupeID, err := queries.CreateGroupe(r.Context(), gen.CreateGroupeParams{
			Name:     nomGroupe,
			OptionID: int32(optionID),
		})
		if err != nil {
			services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
			return
		}

		groupeResult := ImportGroupeResult{
			Nom:      nomGroupe,
			GroupeID: groupeID,
		}

		// Lignes suivantes : emails
		for _, row := range rows[1:] {
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
					groupeResult.NotFound = append(groupeResult.NotFound, email)
					continue
				}
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			if err := queries.AddUserToGroupe(r.Context(), gen.AddUserToGroupeParams{
				GroupeID: groupeID,
				UserID:   user.ID,
			}); err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}
			groupeResult.Added++
		}

		slog.Debug("Import multi-groupes: feuille traitée",
			"groupe", nomGroupe,
			"groupe_id", groupeID,
			"added", groupeResult.Added,
			"not_found", len(groupeResult.NotFound),
		)

		result.Groupes = append(result.Groupes, groupeResult)
	}

	if err := tx.Commit(r.Context()); err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur commit transaction: %v", err), services.NO_INFORMATION, nil)
		return
	}

	render.JSON(w, r, result)
}
