package mobilite

import (
	"cyb-react/pkg/certification/mobilite/gen"
	"cyb-react/pkg/services"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

var mobiliteConstraints = map[string]services.ConstraintRule{
	"fk_mobilite_user": {Field: "user_id", Message: "L'élève n'existe pas"},
}

func CreateMobilite(w http.ResponseWriter, r *http.Request) {
	var input gen.MobiliteInternationale
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateMobilite(r.Context(), gen.CreateMobiliteParams{
		UserID:       input.UserID,
		Pays:         input.Pays,
		Ville:        input.Ville,
		TypeMobilite: input.TypeMobilite,
		DateDebut:    input.DateDebut,
		DateFin:      input.DateFin,
		EstValide:    input.EstValide,
		Remarque:     input.Remarque,
		PromotionID:  input.PromotionID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, mobiliteConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Mobilité créée", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)
}

func FetchMobilite(w http.ResponseWriter, r *http.Request) {
	mobilite := getMobiliteFromCtx(r)
	render.JSON(w, r, mobilite)
}

func FetchMobilitesByPromotionID(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	fIDStr := r.URL.Query().Get("promotion_id")
	if fIDStr == "" {
		services.InvalidRequestError(w, r, "promotion_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, err := strconv.Atoi(fIDStr)
	if err != nil {
		services.InvalidRequestError(w, r, "promotion_id invalide", services.INVALID_PARAM, nil)
		return
	}

	_, err = queries.CheckPromotionExistsMobilite(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Promotion introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	mobilites, err := queries.FetchMobilitesByPromotionId(r.Context(), int32(fID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if mobilites == nil {
		mobilites = []gen.FetchMobilitesByPromotionIdRow{}
	}

	render.JSON(w, r, mobilites)
}

func UpdateMobilite(w http.ResponseWriter, r *http.Request) {
	var input gen.MobiliteInternationale
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateMobilite(r.Context(), gen.UpdateMobiliteParams{
		ID:           input.ID,
		Version:      input.Version,
		Pays:         input.Pays,
		Ville:        input.Ville,
		TypeMobilite: input.TypeMobilite,
		DateDebut:    input.DateDebut,
		DateFin:      input.DateFin,
		EstValide:    input.EstValide,
		Remarque:     input.Remarque,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, mobiliteConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Mobilité mise à jour", "id", input.ID)

	input.Version = version
	render.JSON(w, r, input)
}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func DeleteMobilite(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	if err := queries.DeleteMobilite(r.Context(), input.IDs); err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Suppression des mobilités", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)
}
