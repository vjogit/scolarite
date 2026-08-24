package promotion

import (
	"cyb-react/pkg/corbeille"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/promotion/gen"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Promotion"
var promotionConstraints = map[string]services.ConstraintRule{
	"chk_promotion_name_length": {Field: "name", Motif: services.MotifChampObligatoire},
	"uk_promotion_name_active":  {Field: "name", Motif: services.MotifValeurDejaUtilisee},
	"chk_promotion_dates":       {Field: "fin", Motif: services.MotifFinAvantDebut},
	"fk_promotion_formation":    {Field: "formation_id", Motif: services.MotifReferenceInconnue},
	"chk_promotion_echelle_len": {
		Field: "echelle",
		Motif: services.MotifEchelleLongueur,
	},
	"chk_promotion_echelle_desc": {
		Field: "echelle",
		Motif: services.MotifEchelleDecroissante,
	},
	"chk_promotion_bareme_positive": {
		Field: "bareme",
		Motif: services.MotifValeurNegative,
	},
	"chk_promotion_echelle_bareme": {
		Field: "echelle",
		Motif: services.MotifEchelleHorsBareme,
	},
}

func CreatePromotion(w http.ResponseWriter, r *http.Request) {
	var input gen.PromotionActive
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
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
		Bareme:                   input.Bareme,
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

		services.ServerError(w, r, err)
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

	var promotions []gen.PromotionActive
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
		services.ServerError(w, r, err)
		return
	}

	// 2. Récupération des données
	promotions, err = queries.FetchPromotionsByFormationID(r.Context(), int32(fID))

	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if promotions == nil {
		promotions = []gen.PromotionActive{}
	}

	render.JSON(w, r, promotions)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.PromotionActive
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
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
		Bareme:                   input.Bareme,
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

		services.ServerError(w, r, err)
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
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Blocage métier : une période déjà délibérée (résultats dans jury_result)
	// ne doit jamais être détruite, y compris via la cascade d'un parent.
	nbPeriodesDeliberees, err := queries.CountPromotionJuryDeliberePeriodes(r.Context(), input.IDs)
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
		corbeille.RacinePromotion, input.IDs, services.SubFromCtx(r)); err != nil {
		services.ServerError(w, r, fmt.Errorf("suppression impossible (entite %v, ids %v): %w", "promotion", input.IDs, err))
		return
	}

	slog.Debug("Supression des promotions", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)

}
