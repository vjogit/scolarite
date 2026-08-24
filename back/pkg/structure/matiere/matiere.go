package matiere

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/matiere/gen"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Matiere"
var matiereConstraints = map[string]services.ConstraintRule{
	"chk_matiere_name_length":    {Field: "name", Motif: services.MotifChampObligatoire},
	"chk_matiere_heure_positive": {Field: "heure", Motif: services.MotifValeurNegative},
	"chk_matiere_coeff_positive": {Field: "coeff", Motif: services.MotifValeurNegative},
	"fk_matiere_ue":              {Field: "unite_enseignement_id", Motif: services.MotifReferenceInconnue},
}

func CreateMatiere(w http.ResponseWriter, r *http.Request) {
	var input gen.Matiere
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateMatiere(r.Context(), gen.CreateMatiereParams{
		Name:                input.Name,
		Coeff:               input.Coeff,
		Heure:               input.Heure,
		UniteEnseignementID: input.UniteEnseignementID,
		Color:               input.Color,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, matiereConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de la matière", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Matiere créée", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)

}

func FetchMatiere(w http.ResponseWriter, r *http.Request) {
	user := getMatiereFromCtx(r)
	render.JSON(w, r, user)
}

func FetchMatieresByUniteEnseignementID(w http.ResponseWriter, r *http.Request) {

	queries := getQueriesFromCtx(r)

	var ues []gen.Matiere
	var err error
	var fIDStr string

	// Filtrage manuel si ue_id est présent
	if fIDStr = r.URL.Query().Get("unite_enseignement_id"); fIDStr == "" {
		services.InvalidRequestError(w, r, "unite_enseignement_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "unite_enseignement_id invalide", services.INVALID_PARAM, nil)
		return
	}

	// 1. Vérification explicite de l'existence de la ue
	_, err = queries.CheckUniteEnseignementExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "UniteEnseignement introuvable", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	// 2. Récupération des données
	ues, err = queries.FetchMatieresByUniteEnseignementID(r.Context(), int32(fID))

	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if ues == nil {
		ues = []gen.Matiere{}
	}

	render.JSON(w, r, ues)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.Matiere
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateMatiere(r.Context(), gen.UpdateMatiereParams{
		ID:      input.ID,
		Version: input.Version,
		Name:    input.Name,
		Coeff:   input.Coeff,
		Heure:   input.Heure,
		Color:   input.Color,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, matiereConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de la matière", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		if errors.Is(err, pgx.ErrNoRows) {
			// CONFLIT DÉTECTÉ
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}

		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Matiere mise à jour", "id", input.ID)

	input.Version = version
	render.JSON(w, r, input)

}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func Delete(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	err := queries.DeleteMatiere(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Supression des ues", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)

}
