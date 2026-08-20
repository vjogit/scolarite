package periode

import (
	"cyb-react/pkg/corbeille"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/periode/gen"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Periode"
var periodeConstraints = map[string]services.ConstraintRule{
	"chk_periode_name_length": {Field: "name", Message: "Ce champ est obligatoire"},
	"chk_periode_dates":       {Field: "fin", Message: "La date de fin doit être après la date de début"},
	"fk_periode_option":       {Field: "option_id", Message: "L'option spécifiée n'existe pas"},
}

func CreatePeriode(w http.ResponseWriter, r *http.Request) {
	var input gen.PeriodeActive
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreatePeriode(r.Context(), gen.CreatePeriodeParams{
		Name:     input.Name,
		Debut:    input.Debut,
		Fin:      input.Fin,
		OptionID: input.OptionID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, periodeConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de la période", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Periode créée", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)

}

func FetchPeriode(w http.ResponseWriter, r *http.Request) {
	user := getPeriodeFromCtx(r)
	render.JSON(w, r, user)
}

func FetchPeriodesByOptionID(w http.ResponseWriter, r *http.Request) {

	queries := getQueriesFromCtx(r)

	var periodes []gen.PeriodeActive
	var err error
	var fIDStr string

	// Filtrage manuel si option_id est présent
	if fIDStr = r.URL.Query().Get("option_id"); fIDStr == "" {
		services.InvalidRequestError(w, r, "option_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "option_id invalide", services.INVALID_PARAM, nil)
		return
	}

	// 1. Vérification explicite de l'existence de la option
	_, err = queries.CheckOptionExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Option introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// 2. Récupération des données
	periodes, err = queries.FetchPeriodesByOptionID(r.Context(), int32(fID))

	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if periodes == nil {
		periodes = []gen.PeriodeActive{}
	}

	render.JSON(w, r, periodes)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.PeriodeActive
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdatePeriode(r.Context(), gen.UpdatePeriodeParams{
		ID:      input.ID,
		Version: input.Version,
		Name:    input.Name,
		Debut:   input.Debut,
		Fin:     input.Fin,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, periodeConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de la période", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
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

	slog.Debug("Periode mise à jour", "id", input.ID)

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
	nbPeriodesDeliberees, err := queries.CountPeriodeJuryDeliberePeriodes(r.Context(), input.IDs)
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

	// Suppression logique propagée : l'entité et sa descendance structurelle
	// partent en corbeille, restaurables jusqu'à purge.
	if _, err := corbeille.MettreEnCorbeille(r.Context(), services.GetPgCtx(r.Context()).Db,
		corbeille.RacinePeriode, input.IDs, services.SubFromCtx(r)); err != nil {
		slog.Error("suppression impossible", "entite", "periode", "ids", input.IDs, "error", err)
		services.InternalServerError(w, r, "Suppression impossible", services.INTERNAL_ERROR, nil)
		return
	}

	slog.Debug("Supression des periodes", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)

}
