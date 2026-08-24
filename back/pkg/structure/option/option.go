package option

import (
	"cyb-react/pkg/corbeille"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/option/gen"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Option"
var optionConstraints = map[string]services.ConstraintRule{
	"chk_option_name_length": {Field: "name", Motif: services.MotifChampObligatoire},
	"fk_option_promotion":    {Field: "promotion_id", Motif: services.MotifReferenceInconnue},
}

func CreateOption(w http.ResponseWriter, r *http.Request) {
	var input gen.OptionActive
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateOption(r.Context(), gen.CreateOptionParams{
		Name:        input.Name,
		PromotionID: input.PromotionID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, optionConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de l'option", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Option créée", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)

}

func FetchOption(w http.ResponseWriter, r *http.Request) {
	option := GetOptionFromCtx(r)
	render.JSON(w, r, option)
}

func FetchOptionsByPromotionID(w http.ResponseWriter, r *http.Request) {

	queries := getQueriesFromCtx(r)

	var options []gen.OptionActive
	var err error
	var fIDStr string

	// Filtrage manuel si promotion_id est présent
	if fIDStr = r.URL.Query().Get("promotion_id"); fIDStr == "" {
		services.InvalidRequestError(w, r, "promotion_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "promotion_id invalide", services.INVALID_PARAM, nil)
		return
	}

	// 1. Vérification explicite de l'existence de la promotion
	_, err = queries.CheckPromotionExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Promotion introuvable", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	// 2. Récupération des données
	options, err = queries.FetchOptionsByPromotionID(r.Context(), int32(fID))

	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if options == nil {
		options = []gen.OptionActive{}
	}

	render.JSON(w, r, options)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.OptionActive
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateOption(r.Context(), gen.UpdateOptionParams{
		ID:      input.ID,
		Version: input.Version,
		Name:    input.Name,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, optionConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de l'option", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
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

	slog.Debug("Option mise à jour", "id", input.ID)

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

	// Blocage métier : une période déjà délibérée (résultats dans jury_result)
	// ne doit jamais être détruite, y compris via la cascade d'un parent.
	nbPeriodesDeliberees, err := queries.CountOptionJuryDeliberePeriodes(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("suppression : contrôle du jury impossible (ids %v): %w", input.IDs, err))
		return
	}
	if nbPeriodesDeliberees > 0 {
		services.ConflictError(w, r, services.JuryDelibereMessage(nbPeriodesDeliberees), services.BUSINESS_CONFLICT,
			map[string]interface{}{"reason": services.ReasonJuryDelibere})
		return
	}

	// Suppression logique propagée : l'entité et sa descendance structurelle
	// partent en corbeille, restaurables jusqu'à purge.
	if _, err := corbeille.MettreEnCorbeille(r.Context(), services.GetPgCtx(r.Context()).Db,
		corbeille.RacineOption, input.IDs, services.SubFromCtx(r)); err != nil {
		services.ServerError(w, r, fmt.Errorf("suppression impossible (entite %v, ids %v): %w", "option", input.IDs, err))
		return
	}

	slog.Debug("Supression des options", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)

}
