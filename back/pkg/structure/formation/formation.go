package formation

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/formation/gen"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Formation"
var formationConstraints = map[string]services.ConstraintRule{
	"chk_formation_name_length": {Field: "name", Message: "Ce champ est obligatoire"},
	"formation_name_key":        {Field: "name", Message: "Cette valeur est déjà utilisée"},
}

func CreateFormation(w http.ResponseWriter, r *http.Request) {
	var input gen.Formation
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateFormation(r.Context(), input.Name)
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, formationConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de la formation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)

}

func FetchFormation(w http.ResponseWriter, r *http.Request) {
	user := getFormationFromCtx(r)
	render.JSON(w, r, user)
}

func FetchAllFormation(w http.ResponseWriter, r *http.Request) {

	queries := getQueriesFromCtx(r)

	users, err := queries.FetchAllFormation(r.Context())
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	if users == nil {
		users = []gen.Formation{}
	}

	render.JSON(w, r, users)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.Formation
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateFormation(r.Context(), gen.UpdateFormationParams{
		ID:      input.ID,
		Name:    input.Name,
		Version: input.Version,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, formationConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de la formation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		if errors.Is(err, pgx.ErrNoRows) {
			// CONFLIT DÉTECTÉ
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Formation mise à jour", "id", input.ID)

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

	// Blocage métier : une période déjà délibérée (résultats dans jury_result)
	// ne doit jamais être détruite, y compris via la cascade d'un parent.
	nbPeriodesDeliberees, err := queries.CountFormationJuryDeliberePeriodes(r.Context(), input.IDs)
	if err != nil {
		slog.Error("suppression : contrôle du jury impossible", "ids", input.IDs, "error", err)
		services.InternalServerError(w, r, "Suppression impossible", services.INTERNAL_ERROR, nil)
		return
	}
	if nbPeriodesDeliberees > 0 {
		services.ConflictError(w, r, services.JuryDelibereMessage(nbPeriodesDeliberees), services.BUSINESS_CONFLICT,
			map[string]interface{}{"reason": services.ReasonJuryDelibere})
		return
	}

	if err := queries.DeleteFormation(r.Context(), input.IDs); err != nil {
		slog.Error("suppression impossible", "entite", "formation", "ids", input.IDs, "error", err)
		services.InternalServerError(w, r, "Suppression impossible", services.INTERNAL_ERROR, nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)

}
