package groupe

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/groupe/gen"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

var groupeConstraints = map[string]services.ConstraintRule{
	"chk_groupe_name_length": {Field: "name", Motif: services.MotifChampObligatoire},
	"fk_groupe_option":       {Field: "option_id", Motif: services.MotifReferenceInconnue},
}

func CreateGroupe(w http.ResponseWriter, r *http.Request) {
	var input gen.Groupe
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateGroupe(r.Context(), gen.CreateGroupeParams{
		Name:     input.Name,
		OptionID: input.OptionID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, groupeConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données du groupe", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Groupe créé", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)
}

func FetchGroupe(w http.ResponseWriter, r *http.Request) {
	groupe := GetGroupeFromCtx(r)
	render.JSON(w, r, groupe)
}

func FetchGroupesByOptionID(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	fIDStr := r.URL.Query().Get("option_id")
	if fIDStr == "" {
		services.InvalidRequestError(w, r, "option_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "option_id invalide", services.INVALID_PARAM, nil)
		return
	}

	_, err := queries.CheckOptionExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Option introuvable", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	groupes, err := queries.FetchGroupesByOptionID(r.Context(), int32(fID))
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if groupes == nil {
		groupes = []gen.Groupe{}
	}

	render.JSON(w, r, groupes)
}

func UpdateGroupe(w http.ResponseWriter, r *http.Request) {
	var input gen.Groupe
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateGroupe(r.Context(), gen.UpdateGroupeParams{
		ID:      input.ID,
		Version: input.Version,
		Name:    input.Name,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, groupeConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données du groupe", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Groupe mis à jour", "id", input.ID)

	input.Version = version
	render.JSON(w, r, input)
}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func DeleteGroupe(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	err := queries.DeleteGroupe(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Suppression des groupes", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)
}

func FetchUsersInGroupe(w http.ResponseWriter, r *http.Request) {
	groupe := GetGroupeFromCtx(r)
	queries := getQueriesFromCtx(r)

	users, err := queries.FetchUsersByGroupeID(r.Context(), groupe.ID)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if users == nil {
		users = []gen.User{}
	}

	render.JSON(w, r, users)
}

type AddUserRequest struct {
	UserID int32 `json:"user_id"`
}

func AddUserToGroupe(w http.ResponseWriter, r *http.Request) {
	groupe := GetGroupeFromCtx(r)

	var input AddUserRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	err := queries.AddUserToGroupe(r.Context(), gen.AddUserToGroupeParams{
		GroupeID: groupe.ID,
		UserID:   input.UserID,
	})
	if err != nil {
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Utilisateur ajouté au groupe", "groupe_id", groupe.ID, "user_id", input.UserID)

	w.WriteHeader(http.StatusNoContent)
}
