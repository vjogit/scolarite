package formation

import (
	"cyb-react/pkg/corbeille"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/formation/gen"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Formation"
var formationConstraints = map[string]services.ConstraintRule{
	"chk_formation_name_length": {Field: "name", Motif: services.MotifChampObligatoire},
	// Index d'unicité partiel (lignes actives seules) : une formation en
	// corbeille ne bloque pas la réutilisation de son nom.
	"uk_formation_name_active": {Field: "name", Motif: services.MotifValeurDejaUtilisee},
}

func CreateFormation(w http.ResponseWriter, r *http.Request) {
	var input gen.FormationActive
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
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

		services.ServerError(w, r, err)
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
		services.ServerError(w, r, err)
		return
	}

	if users == nil {
		users = []gen.FormationActive{}
	}

	render.JSON(w, r, users)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.FormationActive
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
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
		services.ServerError(w, r, err)
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
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Blocage métier : une période déjà délibérée (résultats dans jury_result)
	// ne doit jamais être détruite, y compris via la cascade d'un parent.
	nbPeriodesDeliberees, err := queries.CountFormationJuryDeliberePeriodes(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("suppression : contrôle du jury impossible (ids %v): %w", input.IDs, err))
		return
	}
	if nbPeriodesDeliberees > 0 {
		services.ConflictError(w, r, services.JuryDelibereMessage(nbPeriodesDeliberees), services.BUSINESS_CONFLICT,
			map[string]interface{}{"reason": services.ReasonJuryDelibere})
		return
	}

	// Suppression logique propagée : la formation et toute sa descendance
	// structurelle partent en corbeille, restaurables jusqu'à purge.
	if _, err := corbeille.MettreEnCorbeille(r.Context(), services.GetPgCtx(r.Context()).Db,
		corbeille.RacineFormation, input.IDs, services.SubFromCtx(r)); err != nil {
		services.ServerError(w, r, fmt.Errorf("suppression impossible (entite %v, ids %v): %w", "formation", input.IDs, err))
		return
	}

	w.WriteHeader(http.StatusNoContent)

}
