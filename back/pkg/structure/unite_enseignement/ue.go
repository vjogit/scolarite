package unite_enseignement

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/unite_enseignement/gen"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "UE"
var ueConstraints = map[string]services.ConstraintRule{
	"chk_ue_name_length": {Field: "name", Motif: services.MotifChampObligatoire},
	"chk_ue_ects_positive": {
		Field: "ects",
		Motif: services.MotifValeurNegative,
	},
	"fk_ue_periode": {Field: "periode_id", Motif: services.MotifReferenceInconnue},
}

func CreateUniteEnseignement(w http.ResponseWriter, r *http.Request) {
	var input gen.UniteEnseignement
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateUniteEnseignement(r.Context(), gen.CreateUniteEnseignementParams{
		Name:       input.Name,
		Ects:       input.Ects,
		Academique: input.Academique,
		PeriodeID:  input.PeriodeID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, ueConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de l'UE", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		services.ServerError(w, r, err)
		return
	}

	slog.Debug("UniteEnseignement créée", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)

}

func FetchUniteEnseignement(w http.ResponseWriter, r *http.Request) {
	user := getUniteEnseignementFromCtx(r)
	render.JSON(w, r, user)
}

func FetchUniteEnseignementsByPeriodeID(w http.ResponseWriter, r *http.Request) {

	queries := getQueriesFromCtx(r)

	var ues []gen.UniteEnseignement
	var err error
	var fIDStr string

	// Filtrage manuel si periode_id est présent
	if fIDStr = r.URL.Query().Get("periode_id"); fIDStr == "" {
		services.InvalidRequestError(w, r, "periode_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "periode_id invalide", services.INVALID_PARAM, nil)
		return
	}

	// 1. Vérification explicite de l'existence de la periode
	_, err = queries.CheckPeriodeExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Periode introuvable", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	// 2. Récupération des données
	ues, err = queries.FetchUniteEnseignementsByPeriodeID(r.Context(), int32(fID))

	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if ues == nil {
		ues = []gen.UniteEnseignement{}
	}

	render.JSON(w, r, ues)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.UniteEnseignement
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateUniteEnseignement(r.Context(), gen.UpdateUniteEnseignementParams{
		ID:         input.ID,
		Version:    input.Version,
		Name:       input.Name,
		Ects:       input.Ects,
		Academique: input.Academique,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, ueConstraints)

		if len(errorsMap) > 0 {
			// On renvoie un 400 avec le détail des champs
			services.InvalidRequestError(w, r, "erreur de validation des données de l'UE", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
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

	slog.Debug("UniteEnseignement mise à jour", "id", input.ID)

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

	err := queries.DeleteUniteEnseignement(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Supression des ues", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)

}
