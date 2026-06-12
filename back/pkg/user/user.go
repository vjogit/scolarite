package user

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/user/gen"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/Nerzal/gocloak/v13"
	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "User"
var userConstraints = map[string]services.ConstraintRule{
	"user_email_key":       {Field: "email", Message: "Cet email est déjà utilisé"},
	"user_keycloak_id_key": {Field: "keycloak_id", Message: "Cet ID Keycloak est déjà associé"},
}

type createUserRequest struct {
	gen.User
	Password string `json:"password"`
}

func CreateUser(w http.ResponseWriter, r *http.Request, cfg *services.KeycloakConfig) {
	var req createUserRequest
	if err := render.DecodeJSON(r.Body, &req); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	input := req.User

	// Création de l'utilisateur dans Keycloak
	kcID, created, err := createKeycloakUser(r.Context(), &input, req.Password, cfg)
	if err != nil {
		services.InternalServerError(w, r, "Erreur lors de la création Keycloak: "+err.Error(), services.NO_INFORMATION, nil)
		return
	}
	input.KeycloakID = &kcID

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateUser(r.Context(), gen.CreateUserParams{
		Firstname:  input.FirstName,
		Lastname:   input.LastName,
		Email:      input.Email,
		KeycloakID: input.KeycloakID,
		Roles:      input.Roles,
	})
	if err != nil {
		// ROLLBACK : Si erreur DB et qu'on vient de créer l'user Keycloak, on le supprime
		if created {
			_ = deleteKeycloakUser(r.Context(), kcID, cfg)
		}
		errorsMap := services.MapPgErrorToValidationErrors(err, userConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("User créé", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)
}

func FetchUser(w http.ResponseWriter, r *http.Request) {
	user := getUserFromCtx(r)
	render.JSON(w, r, user)
}

func FetchAllUser(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	// Note: Assurez-vous que FetchAllUser existe dans vos requêtes SQL (user_read.sql)
	users, err := queries.FetchAllUser(r.Context())
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if users == nil {
		users = []gen.User{}
	}

	render.JSON(w, r, users)
}

// SearchUsers retourne les utilisateurs correspondant à une requête de recherche.
func SearchUsers(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	q := r.URL.Query().Get("q")
	if q == "" {
		services.InvalidRequestError(w, r, "q query doit etre non null", services.MISSING_PARAM, nil)
		return
	}

	users, err := queries.SearchUsers(r.Context(), q)
	if err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("Failed to search users: %v", err), services.NO_INFORMATION, nil)
		return
	}

	if users == nil {
		users = []gen.SearchUsersRow{}
	}

	render.JSON(w, r, users)
}

func Update(w http.ResponseWriter, r *http.Request, cfg *services.KeycloakConfig) {
	var input gen.User
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// Récupération de l'utilisateur actuel pour obtenir son ID Keycloak
	currentUser := getUserFromCtx(r)
	if currentUser != nil && currentUser.KeycloakID != nil && *currentUser.KeycloakID != "" {
		// Si l'ID Keycloak n'est pas dans le payload, on garde l'existant
		if input.KeycloakID == nil {
			input.KeycloakID = currentUser.KeycloakID
		}

		// Mise à jour dans Keycloak
		if err := updateKeycloakUser(r.Context(), *currentUser.KeycloakID, &input, cfg); err != nil {
			services.InternalServerError(w, r, "Erreur mise à jour Keycloak: "+err.Error(), services.NO_INFORMATION, nil)
			return
		}
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateUser(r.Context(), gen.UpdateUserParams{
		ID:         input.ID,
		Version:    input.Version,
		Firstname:  input.FirstName,
		Lastname:   input.LastName,
		Email:      input.Email,
		KeycloakID: input.KeycloakID,
		Roles:      input.Roles,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, userConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("User mis à jour", "id", input.ID)
	input.Version = version
	render.JSON(w, r, input)
}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func Delete(w http.ResponseWriter, r *http.Request, cfg *services.KeycloakConfig) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	ctx := r.Context()

	// Préparation du client Keycloak pour la suppression
	parts := strings.Split(cfg.Realm, "/")
	realm := parts[len(parts)-1]
	client := gocloak.NewClient(cfg.Host)
	token, errToken := client.LoginClient(ctx, cfg.Backend_client_id, cfg.Backend_client_secret, realm)
	if errToken != nil {
		slog.Error("Impossible de se connecter à Keycloak pour suppression", "error", errToken)
	}

	// Suppression dans Keycloak pour chaque utilisateur trouvé
	for _, id := range input.IDs {
		u, err := queries.FetchUserById(ctx, id)
		if err == nil && u.KeycloakID != nil && *u.KeycloakID != "" && token != nil {
			if err := client.DeleteUser(ctx, token.AccessToken, realm, *u.KeycloakID); err != nil {
				slog.Error("Erreur suppression Keycloak", "keycloak_id", *u.KeycloakID, "error", err)
			} else {
				slog.Info("Utilisateur supprimé de Keycloak", "keycloak_id", *u.KeycloakID)
			}
		}
	}

	err := queries.DeleteUser(ctx, input.IDs)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Suppression des users", "ids", input.IDs)
	w.WriteHeader(http.StatusNoContent)
}

// createKeycloakUser gère la création dans Keycloak via l'API Admin (auth incluse).
func createKeycloakUser(ctx context.Context, user *gen.User, password string, cfg *services.KeycloakConfig) (string, bool, error) {
	parts := strings.Split(cfg.Realm, "/")
	realm := parts[len(parts)-1]
	client := gocloak.NewClient(cfg.Host)

	token, err := client.LoginClient(ctx, cfg.Backend_client_id, cfg.Backend_client_secret, realm)
	if err != nil {
		return "", false, err
	}
	return createKeycloakUserWithClient(ctx, client, token.AccessToken, realm, user, password)
}

// createKeycloakUserWithClient crée un utilisateur Keycloak avec un client et token déjà authentifiés.
func createKeycloakUserWithClient(ctx context.Context, client *gocloak.GoCloak, accessToken, realm string, user *gen.User, password string) (string, bool, error) {
	// 1. Création de l'utilisateur
	kcUser := gocloak.User{
		Username:      user.Email, // On utilise l'email comme username
		Email:         user.Email,
		FirstName:     user.FirstName,
		LastName:      user.LastName,
		Enabled:       gocloak.BoolP(true),
		EmailVerified: gocloak.BoolP(true),
	}

	userExisted := false
	id, err := client.CreateUser(ctx, accessToken, realm, kcUser)
	if err != nil {
		if strings.Contains(err.Error(), "409") {
			users, errGet := client.GetUsers(ctx, accessToken, realm, gocloak.GetUsersParams{
				Username: gocloak.StringP(*user.Email),
				Exact:    gocloak.BoolP(true),
			})
			if errGet != nil || len(users) == 0 {
				return "", false, err
			}
			id = *users[0].ID
			userExisted = true
		} else {
			return "", false, err
		}
	}

	// 2. Définition du mot de passe
	if !userExisted {
		if password == "" {
			password = "passwordTemp123!"
		}
		err = client.SetPassword(ctx, accessToken, id, realm, password, false)
		if err != nil {
			return "", false, err
		}
	}

	// 3. Assignation des rôles
	for _, roleStr := range user.Roles {
		role, err := client.GetRealmRole(ctx, accessToken, realm, roleStr)
		if err != nil {
			return "", false, err
		}
		if role != nil {
			err = client.AddRealmRoleToUser(ctx, accessToken, realm, id, []gocloak.Role{*role})
			if err != nil {
				return "", false, err
			}
		}
	}

	return id, !userExisted, nil
}

// deleteKeycloakUser supprime un utilisateur (utilisé pour le rollback)
func deleteKeycloakUser(ctx context.Context, keycloakID string, cfg *services.KeycloakConfig) error {
	parts := strings.Split(cfg.Realm, "/")
	realm := parts[len(parts)-1]
	client := gocloak.NewClient(cfg.Host)

	token, err := client.LoginClient(ctx, cfg.Backend_client_id, cfg.Backend_client_secret, realm)
	if err != nil {
		return err
	}
	return client.DeleteUser(ctx, token.AccessToken, realm, keycloakID)
}

// updateKeycloakUser met à jour les infos et les rôles de l'utilisateur dans Keycloak
func updateKeycloakUser(ctx context.Context, keycloakID string, user *gen.User, cfg *services.KeycloakConfig) error {
	parts := strings.Split(cfg.Realm, "/")
	realm := parts[len(parts)-1]
	client := gocloak.NewClient(cfg.Host)

	token, err := client.LoginClient(ctx, cfg.Backend_client_id, cfg.Backend_client_secret, realm)
	if err != nil {
		return err
	}

	// 1. Mise à jour des attributs de base
	kcUser := gocloak.User{
		ID:        gocloak.StringP(keycloakID),
		Username:  user.Email, // On garde l'email comme username
		Email:     user.Email,
		FirstName: user.FirstName,
		LastName:  user.LastName,
	}

	if err := client.UpdateUser(ctx, token.AccessToken, realm, kcUser); err != nil {
		return err
	}

	// 2. Synchronisation des rôles
	// Récupérer les rôles actuels de l'utilisateur
	currentRoles, err := client.GetRealmRolesByUserID(ctx, token.AccessToken, realm, keycloakID)
	if err != nil {
		return err
	}

	// Map des nouveaux rôles souhaités
	targetRolesMap := make(map[string]bool)
	for _, r := range user.Roles {
		targetRolesMap[r] = true
	}

	// Identifier les rôles à retirer (ceux qui sont dans Keycloak mais pas dans la cible)
	var rolesToRemove []gocloak.Role
	for _, r := range currentRoles {
		if r.Name != nil {
			// On ne touche pas aux rôles par défaut de Keycloak (offline_access, etc.)
			// On suppose que nos rôles applicatifs ne contiennent pas de caractères spéciaux ou sont connus
			if !targetRolesMap[*r.Name] && !isDefaultRole(*r.Name) {
				rolesToRemove = append(rolesToRemove, *r)
			}
		}
	}

	if len(rolesToRemove) > 0 {
		if err := client.DeleteRealmRoleFromUser(ctx, token.AccessToken, realm, keycloakID, rolesToRemove); err != nil {
			return err
		}
	}

	// Identifier les rôles à ajouter
	for _, roleStr := range user.Roles {
		role, err := client.GetRealmRole(ctx, token.AccessToken, realm, roleStr)
		if err == nil && role != nil {
			_ = client.AddRealmRoleToUser(ctx, token.AccessToken, realm, keycloakID, []gocloak.Role{*role})
		}
	}

	return nil
}

func isDefaultRole(roleName string) bool {
	defaults := []string{"offline_access", "uma_authorization", "default-roles-realmcybscolarite"}
	for _, d := range defaults {
		if d == roleName {
			return true
		}
	}
	return false
}
