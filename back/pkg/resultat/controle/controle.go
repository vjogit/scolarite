package controle

import (
	"cyb-react/pkg/resultat/controle/gen"
	"cyb-react/pkg/services"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Controle"
var controleConstraints = map[string]services.ConstraintRule{
	"chk_controle_name_length":    {Field: "name", Message: "Ce champ est obligatoire"},
	"chk_controle_coeff_positive": {Field: "coeff", Message: "Le coefficient doit être positif"},
	"fk_controles_matieres":       {Field: "matiere_id", Message: "La matière n'existe pas"},
}

func CreateControle(w http.ResponseWriter, r *http.Request) {
	var input gen.Controle
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Note: Assurez-vous que gen.CreateControleParams inclut IsRattrapage
	id, err := queries.CreateControle(r.Context(), gen.CreateControleParams{
		Name:         input.Name,
		Coeff:        input.Coeff,
		IsRattrapage: input.IsRattrapage,
		Remarque:     input.Remarque,
		MatiereID:    input.MatiereID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, controleConstraints)

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

func FetchControle(w http.ResponseWriter, r *http.Request) {
	controle := getControleFromCtx(r)
	render.JSON(w, r, controle)
}

func FetchControlesByMatiereID(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	var controles []gen.Controle
	var err error
	var fIDStr string

	if fIDStr = r.URL.Query().Get("matiere_id"); fIDStr == "" {
		services.InvalidRequestError(w, r, "matiere_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "matiere_id invalide", services.INVALID_PARAM, nil)
		return
	}

	_, err = queries.CheckMatiereExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Matière introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	controles, err = queries.FetchControlesByMatiereId(r.Context(), int32(fID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if controles == nil {
		controles = []gen.Controle{}
	}

	render.JSON(w, r, controles)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.Controle
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Note: Assurez-vous que gen.UpdateControleParams inclut IsRattrapage
	version, err := queries.UpdateControle(r.Context(), gen.UpdateControleParams{
		ID:           input.ID,
		Version:      input.Version,
		Name:         input.Name,
		Coeff:        input.Coeff,
		IsRattrapage: input.IsRattrapage,
		Remarque:     input.Remarque,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, controleConstraints)

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

	err := queries.DeleteControle(r.Context(), input.IDs)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Supression des contrôles", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)
}
