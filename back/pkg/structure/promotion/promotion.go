package promotion

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/promotion/gen"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Promotion"
var promotionConstraints = map[string]services.ConstraintRule{
	"chk_promotion_name_length": {Field: "name", Message: "Ce champ est obligatoire"},
	"promotion_name_key":        {Field: "name", Message: "Cette valeur est déjà utilisée"},
	"chk_promotion_dates":       {Field: "fin", Message: "La date de fin doit être après la date de début"},
	"fk_promotion_formation":    {Field: "formation_id", Message: "La formation spécifiée n'existe pas"},
	"chk_promotion_echelle_len": {
		Field:   "echelle",
		Message: "L'échelle doit contenir 5 valeurs",
	},
	"chk_promotion_echelle_desc": {
		Field:   "echelle",
		Message: "L'échelle doit être décroissante",
	},
}

func CreatePromotion(w http.ResponseWriter, r *http.Request) {
	var input gen.Promotion
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreatePromotion(r.Context(), gen.CreatePromotionParams{
		Name:                     input.Name,
		Debut:                    input.Debut,
		Fin:                      input.Fin,
		FormationID:              input.FormationID,
		EchelleGpa:               input.EchelleGpa,
		Echelle:                  input.Echelle,
		MatiereEliminatoire:      input.MatiereEliminatoire,
		ValueMatiereEliminatoire: input.ValueMatiereEliminatoire,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, promotionConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de la promotion", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Promotion créée", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)
}

func FetchPromotion(w http.ResponseWriter, r *http.Request) {
	user := getPromotionFromCtx(r)
	render.JSON(w, r, user)
}

func FetchPromotionsByFormationID(w http.ResponseWriter, r *http.Request) {

	queries := getQueriesFromCtx(r)

	var promotions []gen.Promotion
	var err error
	var fIDStr string

	// Filtrage manuel si formation_id est présent
	if fIDStr = r.URL.Query().Get("formation_id"); fIDStr == "" {
		services.InvalidRequestError(w, r, "formation_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "formation_id invalide", services.INVALID_PARAM, nil)
		return
	}

	// 1. Vérification explicite de l'existence de la formation
	_, err = queries.CheckFormationExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Formation introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// 2. Récupération des données
	promotions, err = queries.FetchPromotionsByFormationID(r.Context(), int32(fID))

	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if promotions == nil {
		promotions = []gen.Promotion{}
	}

	render.JSON(w, r, promotions)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.Promotion
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdatePromotion(r.Context(), gen.UpdatePromotionParams{
		ID:                       input.ID,
		Name:                     input.Name,
		Version:                  input.Version,
		Debut:                    input.Debut,
		Fin:                      input.Fin,
		EchelleGpa:               input.EchelleGpa,
		Echelle:                  input.Echelle,
		MatiereEliminatoire:      input.MatiereEliminatoire,
		ValueMatiereEliminatoire: input.ValueMatiereEliminatoire,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, promotionConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de la promotion", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
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

	slog.Debug("Promotion mise à jour", "id", input.ID)

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

	err := queries.DeletePromotion(r.Context(), input.IDs)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Supression des promotions", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)

}
