package user

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/user/gen"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
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

// Natures possibles d'une personne. La base est la source de vérité de la
// nature ; les droits, eux, vivent dans Keycloak et ne sont jamais persistés.
const (
	TypePersonneEleve = "ELEVE"
	TypePersonneAgent = "AGENT"
)

// userRequest transporte, en plus des champs persistés, les rôles Keycloak.
// Les rôles ne passent que par ce DTO : ils sont poussés vers Keycloak et ne
// touchent jamais la base.
type userRequest struct {
	gen.User
	Roles []string `json:"roles"`
}

// userResponse renvoie l'utilisateur persisté accompagné de ses rôles Keycloak
// et, à la création, de l'état d'envoi du courriel de définition de mot de passe.
type userResponse struct {
	gen.User
	Roles []string `json:"roles,omitempty"`
	// EmailEnvoye vaut false si le courriel UPDATE_PASSWORD n'a pas pu partir :
	// le compte existe mais reste sans mot de passe utilisable tant qu'un
	// nouvel envoi n'a pas abouti. Aucun mot de passe ne transite jamais ici.
	EmailEnvoye *bool `json:"email_envoye,omitempty"`
}

// normalizeTypePersonne applique la valeur par défaut et valide la nature.
func normalizeTypePersonne(t string) (string, error) {
	switch strings.ToUpper(strings.TrimSpace(t)) {
	case "":
		return TypePersonneAgent, nil
	case TypePersonneEleve:
		return TypePersonneEleve, nil
	case TypePersonneAgent:
		return TypePersonneAgent, nil
	default:
		return "", fmt.Errorf("nature inconnue : %q", t)
	}
}

// validateRoles refuse toute entrée hors de la liste fermée AssignableRoles.
func validateRoles(roles []string) error {
	for _, role := range roles {
		if !services.IsAssignableRole(role) {
			return fmt.Errorf("rôle non attribuable : %q", role)
		}
	}
	return nil
}

func CreateUser(w http.ResponseWriter, r *http.Request, cfg *services.KeycloakConfig) {
	var req userRequest
	if err := render.DecodeJSON(r.Body, &req); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.NO_INFORMATION, nil)
		return
	}
	input := req.User

	typePersonne, err := normalizeTypePersonne(input.TypePersonne)
	if err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.INVALID_PARAM, nil)
		return
	}
	input.TypePersonne = typePersonne

	// L'application est réservée au personnel : pas de compte Keycloak ni de
	// rôles pour un élève, seule sa ligne en base existe.
	if typePersonne == TypePersonneEleve && len(req.Roles) > 0 {
		services.InvalidRequestError(w, r, "un élève ne porte pas de rôle applicatif", services.INVALID_PARAM, nil)
		return
	}
	if err := validateRoles(req.Roles); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.INVALID_PARAM, nil)
		return
	}

	var emailEnvoye *bool
	created := false
	kcID := ""
	if typePersonne == TypePersonneAgent {
		if input.Email == nil || *input.Email == "" {
			services.InvalidRequestError(w, r, "email requis pour un agent", services.MISSING_PARAM, nil)
			return
		}

		// Création dans Keycloak, puis envoi du courriel UPDATE_PASSWORD :
		// l'application ne définit jamais de mot de passe.
		client, token, realm, err := newKeycloakAdminClient(r.Context(), cfg)
		if err != nil {
			slog.Error("connexion Keycloak impossible", "err", err)
			services.InternalServerError(w, r, "Erreur lors de la création Keycloak", services.NO_INFORMATION, nil)
			return
		}
		kcID, created, err = createKeycloakUserWithClient(r.Context(), client, token, realm, &input, req.Roles)
		if err != nil {
			slog.Error("création Keycloak impossible", "email", *input.Email, "err", err)
			services.InternalServerError(w, r, "Erreur lors de la création Keycloak", services.NO_INFORMATION, nil)
			return
		}
		input.KeycloakID = &kcID

		if created {
			sent := true
			if err := sendPasswordEmail(r.Context(), client, token, realm, kcID); err != nil {
				// Règle retenue : le compte est conservé, sans mot de passe
				// utilisable ; l'appelant est prévenu via email_envoye=false
				// et peut relancer l'envoi (nouvelle modification, ou console
				// Keycloak). La création n'est pas annulée.
				slog.Error("envoi du courriel de définition de mot de passe impossible",
					"email", *input.Email, "err", err)
				sent = false
			}
			emailEnvoye = &sent
		}
	}

	queries := getQueriesFromCtx(r)

	id, err := queries.CreateUser(r.Context(), gen.CreateUserParams{
		Firstname:    input.FirstName,
		Lastname:     input.LastName,
		Email:        input.Email,
		KeycloakID:   input.KeycloakID,
		TypePersonne: input.TypePersonne,
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
		slog.Error("insertion user impossible", "err", err)
		services.InternalServerError(w, r, "Erreur lors de l'enregistrement", services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("User créé", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, userResponse{User: input, Roles: req.Roles, EmailEnvoye: emailEnvoye})
}

func FetchUser(w http.ResponseWriter, r *http.Request, cfg *services.KeycloakConfig) {
	user := getUserFromCtx(r)
	if user == nil {
		services.InternalServerError(w, r, "utilisateur absent du contexte", services.NO_INFORMATION, nil)
		return
	}

	// Les rôles ne sont plus persistés : ils sont relus depuis Keycloak, leur
	// source de vérité, pour alimenter le formulaire d'édition.
	var roles []string
	if user.KeycloakID != nil && *user.KeycloakID != "" {
		var err error
		roles, err = fetchKeycloakRoles(r.Context(), cfg, *user.KeycloakID)
		if err != nil {
			// Lecture d'agrément : l'utilisateur reste consultable sans ses rôles.
			slog.Error("lecture des rôles Keycloak impossible", "keycloak_id", *user.KeycloakID, "err", err)
		}
	}

	render.JSON(w, r, userResponse{User: *user, Roles: roles})
}

func FetchAllUser(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	users, err := queries.FetchAllUser(r.Context())
	if err != nil {
		slog.Error("lecture des users impossible", "err", err)
		services.InternalServerError(w, r, "Erreur de lecture", services.NO_INFORMATION, nil)
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
		slog.Error("recherche users impossible", "err", err)
		services.InternalServerError(w, r, "Erreur de recherche", services.NO_INFORMATION, nil)
		return
	}

	if users == nil {
		users = []gen.SearchUsersRow{}
	}

	render.JSON(w, r, users)
}

func Update(w http.ResponseWriter, r *http.Request, cfg *services.KeycloakConfig) {
	var req userRequest
	if err := render.DecodeJSON(r.Body, &req); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.NO_INFORMATION, nil)
		return
	}
	input := req.User

	// Récupération de l'utilisateur actuel pour obtenir son ID Keycloak
	currentUser := getUserFromCtx(r)

	// La nature ne change pas par défaut ; une valeur explicite est validée.
	if input.TypePersonne == "" && currentUser != nil {
		input.TypePersonne = currentUser.TypePersonne
	}
	typePersonne, err := normalizeTypePersonne(input.TypePersonne)
	if err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.INVALID_PARAM, nil)
		return
	}
	input.TypePersonne = typePersonne

	if err := validateRoles(req.Roles); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.INVALID_PARAM, nil)
		return
	}

	if currentUser != nil && currentUser.KeycloakID != nil && *currentUser.KeycloakID != "" {
		// Si l'ID Keycloak n'est pas dans le payload, on garde l'existant
		if input.KeycloakID == nil {
			input.KeycloakID = currentUser.KeycloakID
		}

		// Mise à jour dans Keycloak. Roles à nil signifie « ne pas toucher aux
		// rôles » ; une liste (même vide) les remplace.
		if err := updateKeycloakUser(r.Context(), *currentUser.KeycloakID, &input, req.Roles, cfg); err != nil {
			slog.Error("mise à jour Keycloak impossible", "keycloak_id", *currentUser.KeycloakID, "err", err)
			services.InternalServerError(w, r, "Erreur mise à jour Keycloak", services.NO_INFORMATION, nil)
			return
		}
	}

	queries := getQueriesFromCtx(r)

	version, err := queries.UpdateUser(r.Context(), gen.UpdateUserParams{
		ID:           input.ID,
		Version:      input.Version,
		Firstname:    input.FirstName,
		Lastname:     input.LastName,
		Email:        input.Email,
		KeycloakID:   input.KeycloakID,
		TypePersonne: input.TypePersonne,
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
		slog.Error("mise à jour user impossible", "id", input.ID, "err", err)
		services.InternalServerError(w, r, "Erreur lors de l'enregistrement", services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("User mis à jour", "id", input.ID)
	input.Version = version
	render.JSON(w, r, userResponse{User: input, Roles: req.Roles})
}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func Delete(w http.ResponseWriter, r *http.Request, cfg *services.KeycloakConfig) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	ctx := r.Context()

	// Préparation du client Keycloak pour la suppression
	client, token, realm, errToken := newKeycloakAdminClient(ctx, cfg)
	if errToken != nil {
		slog.Error("Impossible de se connecter à Keycloak pour suppression", "error", errToken)
	}

	// Suppression dans Keycloak pour chaque utilisateur trouvé
	for _, id := range input.IDs {
		u, err := queries.FetchUserById(ctx, id)
		if err == nil && u.KeycloakID != nil && *u.KeycloakID != "" && errToken == nil {
			if err := client.DeleteUser(ctx, token, realm, *u.KeycloakID); err != nil {
				slog.Error("Erreur suppression Keycloak", "keycloak_id", *u.KeycloakID, "error", err)
			} else {
				slog.Info("Utilisateur supprimé de Keycloak", "keycloak_id", *u.KeycloakID)
			}
		}
	}

	err := queries.DeleteUser(ctx, input.IDs)
	if err != nil {
		slog.Error("suppression users impossible", "ids", input.IDs, "err", err)
		services.InternalServerError(w, r, "Erreur lors de la suppression", services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Suppression des users", "ids", input.IDs)
	w.WriteHeader(http.StatusNoContent)
}

// newKeycloakAdminClient authentifie le client de service backend et retourne
// le client gocloak, le jeton d'accès et le nom court du realm.
func newKeycloakAdminClient(ctx context.Context, cfg *services.KeycloakConfig) (*gocloak.GoCloak, string, string, error) {
	parts := strings.Split(cfg.Realm, "/")
	realm := parts[len(parts)-1]
	client := gocloak.NewClient(cfg.Host)

	token, err := client.LoginClient(ctx, cfg.Backend_client_id, cfg.Backend_client_secret, realm)
	if err != nil {
		return nil, "", "", err
	}
	return client, token.AccessToken, realm, nil
}

// createKeycloakUserWithClient crée un utilisateur Keycloak avec un client et
// token déjà authentifiés, et lui assigne les rôles donnés (déjà validés
// contre services.AssignableRoles). Aucun mot de passe n'est défini : c'est le
// courriel UPDATE_PASSWORD (sendPasswordEmail) qui permet à l'utilisateur de
// choisir le sien.
func createKeycloakUserWithClient(ctx context.Context, client *gocloak.GoCloak, accessToken, realm string, user *gen.User, roles []string) (string, bool, error) {
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

	// 2. Assignation des rôles
	for _, roleStr := range roles {
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

// sendPasswordEmail déclenche l'action Keycloak UPDATE_PASSWORD par courriel :
// l'utilisateur définit lui-même son mot de passe via le lien reçu. Aucun
// secret ne transite par l'application, ses logs ou ses réponses HTTP.
func sendPasswordEmail(ctx context.Context, client *gocloak.GoCloak, accessToken, realm, keycloakID string) error {
	lifespan := 3 * 24 * 3600 // validité du lien : 3 jours
	return client.ExecuteActionsEmail(ctx, accessToken, realm, gocloak.ExecuteActionsEmail{
		UserID:   &keycloakID,
		Lifespan: &lifespan,
		Actions:  &[]string{"UPDATE_PASSWORD"},
	})
}

// deleteKeycloakUser supprime un utilisateur (utilisé pour le rollback)
func deleteKeycloakUser(ctx context.Context, keycloakID string, cfg *services.KeycloakConfig) error {
	client, token, realm, err := newKeycloakAdminClient(ctx, cfg)
	if err != nil {
		return err
	}
	return client.DeleteUser(ctx, token, realm, keycloakID)
}

// fetchKeycloakRoles retourne les rôles applicatifs (liste AssignableRoles)
// portés par l'utilisateur dans Keycloak. Les rôles techniques du realm
// (offline_access, default-roles-*, …) sont ignorés.
func fetchKeycloakRoles(ctx context.Context, cfg *services.KeycloakConfig, keycloakID string) ([]string, error) {
	client, token, realm, err := newKeycloakAdminClient(ctx, cfg)
	if err != nil {
		return nil, err
	}

	kcRoles, err := client.GetRealmRolesByUserID(ctx, token, realm, keycloakID)
	if err != nil {
		return nil, err
	}

	var roles []string
	for _, role := range kcRoles {
		if role.Name != nil && services.IsAssignableRole(*role.Name) {
			roles = append(roles, *role.Name)
		}
	}
	return roles, nil
}

// updateKeycloakUser met à jour les infos et les rôles de l'utilisateur dans
// Keycloak. roles à nil laisse les rôles en l'état ; une liste (même vide) les
// remplace. Seuls les rôles de la liste AssignableRoles sont gérés : les rôles
// techniques du realm ne sont jamais retirés.
func updateKeycloakUser(ctx context.Context, keycloakID string, user *gen.User, roles []string, cfg *services.KeycloakConfig) error {
	client, token, realm, err := newKeycloakAdminClient(ctx, cfg)
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

	if err := client.UpdateUser(ctx, token, realm, kcUser); err != nil {
		return err
	}

	if roles == nil {
		return nil
	}

	// 2. Synchronisation des rôles applicatifs
	currentRoles, err := client.GetRealmRolesByUserID(ctx, token, realm, keycloakID)
	if err != nil {
		return err
	}

	// Rôles à retirer : ceux que l'application gère (AssignableRoles) et qui
	// ne figurent plus dans la cible.
	var rolesToRemove []gocloak.Role
	for _, role := range currentRoles {
		if role.Name != nil && services.IsAssignableRole(*role.Name) && !slices.Contains(roles, *role.Name) {
			rolesToRemove = append(rolesToRemove, *role)
		}
	}

	if len(rolesToRemove) > 0 {
		if err := client.DeleteRealmRoleFromUser(ctx, token, realm, keycloakID, rolesToRemove); err != nil {
			return err
		}
	}

	// Rôles à ajouter
	for _, roleStr := range roles {
		role, err := client.GetRealmRole(ctx, token, realm, roleStr)
		if err == nil && role != nil {
			_ = client.AddRealmRoleToUser(ctx, token, realm, keycloakID, []gocloak.Role{*role})
		}
	}

	return nil
}
