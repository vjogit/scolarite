package salle

import (
	"cyb-react/pkg/planning/salle/gen"
	"cyb-react/pkg/services"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

var salleConstraints = map[string]services.ConstraintRule{
	"salle_name_key": {Field: "name", Message: "Cette valeur est déjà utilisée"},
}

func CreateSalle(w http.ResponseWriter, r *http.Request) {
	var input gen.Salle
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateSalle(r.Context(), gen.CreateSalleParams{
		Name:       input.Name,
		Capacite:   input.Capacite,
		Equipement: input.Equipement,
		TypeSalle:  input.TypeSalle,
		Batiment:   input.Batiment,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, salleConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Salle créée", "id", id)
	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)
}

func FetchSalle(w http.ResponseWriter, r *http.Request) {
	salle := getSalleFromCtx(r)
	render.JSON(w, r, salle)
}

func FetchAllSalle(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	salles, err := queries.FetchAllSalle(r.Context())
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if salles == nil {
		salles = []gen.Salle{}
	}

	render.JSON(w, r, salles)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.Salle
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateSalle(r.Context(), gen.UpdateSalleParams{
		ID:         input.ID,
		Version:    input.Version,
		Name:       input.Name,
		Capacite:   input.Capacite,
		Equipement: input.Equipement,
		TypeSalle:  input.TypeSalle,
		Batiment:   input.Batiment,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, salleConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Salle mise à jour", "id", input.ID)
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

	err := queries.DeleteSalle(r.Context(), input.IDs)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Suppression des salles", "ids", input.IDs)
	w.WriteHeader(http.StatusNoContent)
}
