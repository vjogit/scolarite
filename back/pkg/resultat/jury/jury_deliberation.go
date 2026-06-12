package jury

import (
	"cyb-react/pkg/resultat/jury/gen"
	"cyb-react/pkg/services"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
)

// DelibererRequest représente la demande de délibération pour un élève sur une période.
type DelibererRequest struct {
	// false = période non comptabilisée dans le GPA cumulé (redoublant : année échouée)
	CompteCumul bool `json:"compte_cumul"`
}

// DelibererResponse résume le résultat de l'écriture dans jury_result.
type DelibererResponse struct {
	UserID    int32 `json:"user_id"`
	PeriodeID int32 `json:"periode_id"`
	NbUes     int   `json:"nb_ues"`
}

func DelibererEleve(w http.ResponseWriter, r *http.Request) {
	periodeID, err := strconv.Atoi(chi.URLParam(r, "periodeID"))
	if err != nil || periodeID <= 0 {
		services.InvalidRequestError(w, r, "periodeID invalide", services.INVALID_PARAM, nil)
		return
	}
	userID, err := strconv.Atoi(chi.URLParam(r, "userID"))
	if err != nil || userID <= 0 {
		services.InvalidRequestError(w, r, "userID invalide", services.INVALID_PARAM, nil)
		return
	}

	var req DelibererRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		services.InvalidRequestError(w, r, "corps de requête invalide", services.INVALID_BODY, nil)
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

	// Calcul dynamique des résultats actuels de l'élève
	rows, err := queries.Get_gpa_ues_by_periode_v4(r.Context(), int32(periodeID))
	if err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("calcul GPA: %v", err), services.NO_INFORMATION, nil)
		return
	}

	// Filtrer les lignes de cet élève
	var nbUes int
	for _, row := range rows {
		if row.UserID != int32(userID) {
			continue
		}

		var grade *string
		if row.GradeLettre != nil {
			grade = row.GradeLettre
		}

		var gpaIndex *int32
		if row.GradeLettre != nil && *row.GradeLettre != "N.E." {
			idx := gradeToGpaIndex(*row.GradeLettre)
			gpaIndex = &idx
		}

		var ects *float32
		if row.EctsUe != nil {
			val := float32(*row.EctsUe)
			ects = &val
		}

		if err := queries.UpsertJuryResult(r.Context(), gen.UpsertJuryResultParams{
			UserID:              int32(userID),
			PeriodeID:           int32(periodeID),
			UniteEnseignementID: row.UniteEnseignementID,
			Grade:               grade,
			GpaIndex:            gpaIndex,
			Ects:                ects,
			CompteCumul:         req.CompteCumul,
		}); err != nil {
			services.InternalServerError(w, r, fmt.Sprintf("écriture jury_result UE %d: %v", row.UniteEnseignementID, err), services.NO_INFORMATION, nil)
			return
		}
		nbUes++
	}

	if nbUes == 0 {
		services.InvalidRequestError(w, r,
			fmt.Sprintf("aucune donnée trouvée pour l'élève %d sur la période %d", userID, periodeID),
			services.NO_RESULT, nil)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur commit: %v", err), services.NO_INFORMATION, nil)
		return
	}

	render.JSON(w, r, DelibererResponse{
		UserID:    int32(userID),
		PeriodeID: int32(periodeID),
		NbUes:     nbUes,
	})
}

// DelibererBulkEntry représente un élève à délibérer en masse.
type DelibererBulkEntry struct {
	UserID      int32 `json:"user_id"`
	CompteCumul bool  `json:"compte_cumul"`
}

// DelibererBulkRequest représente la demande de délibération groupée.
type DelibererBulkRequest struct {
	Users []DelibererBulkEntry `json:"users"`
}

// DelibererBulkResponse résume les résultats de la délibération groupée.
type DelibererBulkResponse struct {
	Deliberes []DelibererResponse `json:"deliberes"`
	Errors    []string            `json:"errors,omitempty"`
}

// DelibererBulk délibère plusieurs élèves en une seule transaction.
func DelibererBulk(w http.ResponseWriter, r *http.Request) {
	periodeID, err := strconv.Atoi(chi.URLParam(r, "periodeID"))
	if err != nil || periodeID <= 0 {
		services.InvalidRequestError(w, r, "periodeID invalide", services.INVALID_PARAM, nil)
		return
	}

	var req DelibererBulkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Users) == 0 {
		services.InvalidRequestError(w, r, "corps de requête invalide ou liste vide", services.INVALID_BODY, nil)
		return
	}

	// Indexer les entrées par userID pour un accès O(1)
	userMap := make(map[int32]DelibererBulkEntry, len(req.Users))
	for _, u := range req.Users {
		userMap[u.UserID] = u
	}

	pgCtx := services.GetPgCtx(r.Context())
	tx, err := pgCtx.Db.Begin(r.Context())
	if err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur début transaction: %v", err), services.NO_INFORMATION, nil)
		return
	}
	defer tx.Rollback(r.Context())

	queries := getQueriesFromCtx(r).WithTx(tx)

	// Récupérer toutes les lignes GPA de la période en une seule requête
	rows, err := queries.Get_gpa_ues_by_periode_v4(r.Context(), int32(periodeID))
	if err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("calcul GPA: %v", err), services.NO_INFORMATION, nil)
		return
	}

	// Compter les UE écrites par userID
	nbUesByUser := make(map[int32]int, len(req.Users))
	var errs []string

	for _, row := range rows {
		entry, ok := userMap[row.UserID]
		if !ok {
			continue
		}

		var grade *string
		if row.GradeLettre != nil {
			grade = row.GradeLettre
		}

		var gpaIndex *int32
		if row.GradeLettre != nil && *row.GradeLettre != "N.E." {
			idx := gradeToGpaIndex(*row.GradeLettre)
			gpaIndex = &idx
		}

		var ects *float32
		if row.EctsUe != nil {
			val := float32(*row.EctsUe)
			ects = &val
		}

		if err := queries.UpsertJuryResult(r.Context(), gen.UpsertJuryResultParams{
			UserID:              row.UserID,
			PeriodeID:           int32(periodeID),
			UniteEnseignementID: row.UniteEnseignementID,
			Grade:               grade,
			GpaIndex:            gpaIndex,
			Ects:                ects,
			CompteCumul:         entry.CompteCumul,
		}); err != nil {
			errs = append(errs, fmt.Sprintf("élève %d UE %d: %v", row.UserID, row.UniteEnseignementID, err))
		} else {
			nbUesByUser[row.UserID]++
		}
	}

	// Vérifier que chaque élève demandé a bien des données
	for _, u := range req.Users {
		if nbUesByUser[u.UserID] == 0 {
			errs = append(errs, fmt.Sprintf("aucune donnée pour l'élève %d", u.UserID))
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur commit: %v", err), services.NO_INFORMATION, nil)
		return
	}

	var deliberes []DelibererResponse
	for userID, nb := range nbUesByUser {
		deliberes = append(deliberes, DelibererResponse{
			UserID:    userID,
			PeriodeID: int32(periodeID),
			NbUes:     nb,
		})
	}

	render.JSON(w, r, DelibererBulkResponse{Deliberes: deliberes, Errors: errs})
}

func AnnulerDeliberation(w http.ResponseWriter, r *http.Request) {
	periodeID, err := strconv.Atoi(chi.URLParam(r, "periodeID"))
	if err != nil || periodeID <= 0 {
		services.InvalidRequestError(w, r, "periodeID invalide", services.INVALID_PARAM, nil)
		return
	}
	userID, err := strconv.Atoi(chi.URLParam(r, "userID"))
	if err != nil || userID <= 0 {
		services.InvalidRequestError(w, r, "userID invalide", services.INVALID_PARAM, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	if err := queries.DeleteJuryResultByUserPeriode(r.Context(), gen.DeleteJuryResultByUserPeriodeParams{
		UserID:    int32(userID),
		PeriodeID: int32(periodeID),
	}); err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func FetchDeliberations(w http.ResponseWriter, r *http.Request) {
	periodeID, err := strconv.Atoi(chi.URLParam(r, "periodeID"))
	if err != nil || periodeID <= 0 {
		services.InvalidRequestError(w, r, "periodeID invalide", services.INVALID_PARAM, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	rows, err := queries.FetchJuryResultByPeriode(r.Context(), int32(periodeID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if rows == nil {
		rows = []gen.FetchJuryResultByPeriodeRow{}
	}

	render.JSON(w, r, rows)
}

// gradeToGpaIndex convertit un grade lettre en indice GPA (1=A … 5=E, 0=F).
func gradeToGpaIndex(grade string) int32 {
	switch grade {
	case "A":
		return 1
	case "B":
		return 2
	case "C":
		return 3
	case "D":
		return 4
	case "E":
		return 5
	default:
		return 0 // F
	}
}
