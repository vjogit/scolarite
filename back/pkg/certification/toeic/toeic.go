package toeic

import (
	"cyb-react/pkg/certification/toeic/gen"
	"cyb-react/pkg/services"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Toeic"
var toeicConstraints = map[string]services.ConstraintRule{
	"chk_toeic_name_length":    {Field: "name", Message: "Ce champ est obligatoire"},
	"chk_toeic_coeff_positive": {Field: "coeff", Message: "Le coefficient doit être positif"},
	"fk_toeics_matieres":       {Field: "promotion_id", Message: "La matière n'existe pas"},
}

func CreateToeic(w http.ResponseWriter, r *http.Request) {
	var input gen.Toeic
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Note: Assurez-vous que gen.CreateToeicParams inclut IsRattrapage
	id, err := queries.CreateToeic(r.Context(), gen.CreateToeicParams{
		Score:       input.Score,
		DatePassage: input.DatePassage,
		Remarque:    input.Remarque,
		PromotionID: input.PromotionID,
		UserID:      input.UserID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, toeicConstraints)

		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données du contrôle", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Contrôle créé", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)
}

func FetchToeic(w http.ResponseWriter, r *http.Request) {
	toeic := getToeicFromCtx(r)
	render.JSON(w, r, toeic)
}

func FetchToeicsByPromotionID(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)
	var fIDStr string

	if fIDStr = r.URL.Query().Get("promotion_id"); fIDStr == "" {
		services.InvalidRequestError(w, r, "promotion_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "promotion_id invalide", services.INVALID_PARAM, nil)
		return
	}

	_, err := queries.CheckPromotionExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Matière introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	toeics, err := queries.FetchToeicsByPromotionId(r.Context(), int32(fID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if toeics == nil {
		toeics = []gen.FetchToeicsByPromotionIdRow{}
	}

	render.JSON(w, r, toeics)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.Toeic
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Note: Assurez-vous que gen.UpdateToeicParams inclut IsRattrapage
	version, err := queries.UpdateToeic(r.Context(), gen.UpdateToeicParams{
		ID:          input.ID,
		Version:     input.Version,
		Score:       input.Score,
		DatePassage: input.DatePassage,
		Remarque:    input.Remarque,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, toeicConstraints)

		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données du contrôle", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}

		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Contrôle mis à jour", "id", input.ID)

	input.Version = version
	render.JSON(w, r, input)
}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func Delete(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	err := queries.DeleteToeic(r.Context(), input.IDs)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Supression des contrôles", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)
}
