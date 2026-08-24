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

// GRADE_NON_EVALUE est le grade rendu par la fonction de jury pour une UE dont
// une matière au moins n'a pas de moyenne.
const GRADE_NON_EVALUE = "N.E."

// uesNonEvaluees liste les UE non évaluées d'un élève parmi les lignes déjà
// calculées pour la période.
//
// Un dossier incomplet ne se délibère pas : l'élève repassera en jury quand ses
// notes seront complètes, et le jury doit le voir plutôt que de statuer sur un
// GPA que la période laisse volontairement vide.
func uesNonEvaluees[T any](rows []T, userID int32, cle func(T) (int32, *string, int32)) []int32 {
	var ues []int32
	for _, row := range rows {
		id, grade, ueID := cle(row)
		if id != userID || grade == nil || *grade != GRADE_NON_EVALUE {
			continue
		}
		ues = append(ues, ueID)
	}
	return ues
}

func messageDossierIncomplet(ues []int32) string {
	if len(ues) == 1 {
		return "Délibération impossible : une unité d'enseignement n'est pas évaluée. " +
			"L'élève repassera en jury lorsque ses notes seront complètes."
	}
	return fmt.Sprintf("Délibération impossible : %d unités d'enseignement ne sont pas évaluées. "+
		"L'élève repassera en jury lorsque ses notes seront complètes.", len(ues))
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
		services.ServerError(w, r, fmt.Errorf("erreur début transaction: %w", err))
		return
	}
	defer tx.Rollback(r.Context())

	queries := getQueriesFromCtx(r).WithTx(tx)

	// Calcul dynamique des résultats actuels de l'élève
	rows, err := queries.Get_gpa_ues_by_periode_v5(r.Context(), int32(periodeID))
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("calcul GPA: %w", err))
		return
	}

	// Un dossier portant une UE non évaluée n'est pas délibérable. Le contrôle
	// précède toute écriture : rien ne doit entrer dans jury_result pour un
	// élève dont le semestre n'est pas terminé.
	if ues := uesNonEvaluees(rows, int32(userID), func(row gen.Get_gpa_ues_by_periode_v5Row) (int32, *string, int32) {
		return row.UserID, row.GradeLettre, row.UniteEnseignementID
	}); len(ues) > 0 {
		services.ConflictError(w, r, messageDossierIncomplet(ues), services.BUSINESS_CONFLICT,
			map[string]any{"unites_enseignement_non_evaluees": ues})
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
			services.ServerError(w, r, fmt.Errorf("écriture jury_result UE %d: %w", row.UniteEnseignementID, err))
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
		services.ServerError(w, r, fmt.Errorf("erreur commit: %w", err))
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
		services.ServerError(w, r, fmt.Errorf("erreur début transaction: %w", err))
		return
	}
	defer tx.Rollback(r.Context())

	queries := getQueriesFromCtx(r).WithTx(tx)

	// Récupérer toutes les lignes GPA de la période en une seule requête
	rows, err := queries.Get_gpa_ues_by_periode_v5(r.Context(), int32(periodeID))
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("calcul GPA: %w", err))
		return
	}

	// Compter les UE écrites par userID
	nbUesByUser := make(map[int32]int, len(req.Users))
	var errs []string

	// Les dossiers incomplets sortent de la sélection avant toute écriture, et
	// sont signalés un par un : une délibération groupée doit dire qui elle a
	// écarté, sans quoi l'assistante croirait la promotion entièrement statuée.
	for _, u := range req.Users {
		if ues := uesNonEvaluees(rows, u.UserID, func(row gen.Get_gpa_ues_by_periode_v5Row) (int32, *string, int32) {
			return row.UserID, row.GradeLettre, row.UniteEnseignementID
		}); len(ues) > 0 {
			errs = append(errs, fmt.Sprintf("élève %d : %s", u.UserID, messageDossierIncomplet(ues)))
			delete(userMap, u.UserID)
		}
	}

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

	// Vérifier que chaque élève demandé a bien des données. Les dossiers
	// incomplets ont quitté `userMap` plus haut avec leur propre message : les
	// recompter ici les signalerait deux fois, sous un motif inexact.
	for _, u := range req.Users {
		if _, retenu := userMap[u.UserID]; !retenu {
			continue
		}
		if nbUesByUser[u.UserID] == 0 {
			errs = append(errs, fmt.Sprintf("aucune donnée pour l'élève %d", u.UserID))
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		services.ServerError(w, r, fmt.Errorf("erreur commit: %w", err))
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
		services.ServerError(w, r, err)
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
		services.ServerError(w, r, err)
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
