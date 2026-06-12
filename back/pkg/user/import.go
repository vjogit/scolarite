package user

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/user/gen"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	gocloak "github.com/Nerzal/gocloak/v13"
	"github.com/go-chi/render"
	"github.com/xuri/excelize/v2"
	"golang.org/x/sync/errgroup"
)

type UserImport struct {
	FirstName string
	LastName  string
	Email     string
	Password  string
	Roles     []string
}

type kcUserResult struct {
	kcID    string
	created bool
}

const importWorkers = 10 // appels Keycloak concurrents

func ImportUsers(w http.ResponseWriter, r *http.Request, cfg *services.KeycloakConfig) {
	// 1. Parsing du fichier Multipart
	err := r.ParseMultipartForm(10 << 20) // Limite 10 MB
	if err != nil {
		services.InvalidRequestError(w, r, "Fichier trop volumineux", services.FILE_TOO_LARGE, nil)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		services.InvalidRequestError(w, r, "Erreur récupération fichier", services.FILE_MISSING, nil)
		return
	}
	defer file.Close()

	// 2. Parsing du fichier Excel
	xlsx, err := excelize.OpenReader(file)
	if err != nil {
		services.InvalidRequestError(w, r, "Format Excel invalide: "+err.Error(), services.NO_INFORMATION, nil)
		return
	}
	defer xlsx.Close()

	sheetName := xlsx.GetSheetName(0)
	rows, err := xlsx.GetRows(sheetName)
	if err != nil {
		services.InvalidRequestError(w, r, "Erreur lecture feuille Excel: "+err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// Colonnes attendues : Nom | Prenom | Mail | Password | Roles
	var users []UserImport
	for _, row := range rows[1:] { // Ignorer la ligne d'en-têtes
		if len(row) < 5 {
			continue
		}
		lastName := strings.TrimSpace(row[0])
		firstName := strings.TrimSpace(row[1])
		email := strings.TrimSpace(row[2])
		password := strings.TrimSpace(row[3])
		rolesRaw := strings.TrimSpace(row[4])

		if email == "" {
			continue
		}

		var roles []string
		for r := range strings.SplitSeq(rolesRaw, ",") {
			if role := strings.TrimSpace(r); role != "" {
				roles = append(roles, role)
			}
		}

		users = append(users, UserImport{
			FirstName: firstName,
			LastName:  lastName,
			Email:     email,
			Password:  password,
			Roles:     roles,
		})
	}

	ctx := r.Context()

	// 3. Auth Keycloak une seule fois pour tout l'import
	parts := strings.Split(cfg.Realm, "/")
	realm := parts[len(parts)-1]
	kcClient := gocloak.NewClient(cfg.Host)

	token, err := kcClient.LoginClient(ctx, cfg.Backend_client_id, cfg.Backend_client_secret, realm)
	if err != nil {
		services.InternalServerError(w, r, "Erreur auth Keycloak: "+err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// 4. Création Keycloak en parallèle (N workers)
	results := make([]kcUserResult, len(users))
	var mu sync.Mutex
	var createdKeycloakIDs []string

	g, gCtx := errgroup.WithContext(ctx)
	sem := make(chan struct{}, importWorkers)

	for i, u := range users {
		i, u := i, u
		g.Go(func() error {
			select {
			case sem <- struct{}{}:
			case <-gCtx.Done():
				return gCtx.Err()
			}
			defer func() { <-sem }()

			input := gen.User{
				FirstName: &u.FirstName,
				LastName:  &u.LastName,
				Email:     &u.Email,
				Roles:     u.Roles,
			}

			kcID, created, err := createKeycloakUserWithClient(gCtx, kcClient, token.AccessToken, realm, &input, u.Password)
			if err != nil {
				return fmt.Errorf("Keycloak %s: %w", u.Email, err)
			}

			mu.Lock()
			results[i] = kcUserResult{kcID: kcID, created: created}
			if created {
				createdKeycloakIDs = append(createdKeycloakIDs, kcID)
			}
			mu.Unlock()
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		// Rollback de tous les utilisateurs Keycloak créés pendant cet import
		for _, id := range createdKeycloakIDs {
			_ = deleteKeycloakUser(context.Background(), id, cfg)
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// 5. Insertions DB dans une transaction globale (séquentiel)
	pgCtx := services.GetPgCtx(ctx)
	tx, err := pgCtx.Db.Begin(ctx)
	if err != nil {
		for _, id := range createdKeycloakIDs {
			_ = deleteKeycloakUser(context.Background(), id, cfg)
		}
		services.InternalServerError(w, r, "Erreur initialisation transaction", services.INTERNAL_ERROR, nil)
		return
	}
	defer tx.Rollback(ctx)

	qtx := gen.New(tx)

	for i, u := range users {
		kcID := results[i].kcID
		_, err = qtx.CreateUser(ctx, gen.CreateUserParams{
			Firstname:  &u.FirstName,
			Lastname:   &u.LastName,
			Email:      &u.Email,
			KeycloakID: &kcID,
			Roles:      u.Roles,
		})
		if err != nil {
			for _, id := range createdKeycloakIDs {
				_ = deleteKeycloakUser(context.Background(), id, cfg)
			}
			services.InternalServerError(w, r, "Erreur DB pour "+u.Email+": "+err.Error(), services.NO_INFORMATION, nil)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		for _, id := range createdKeycloakIDs {
			_ = deleteKeycloakUser(context.Background(), id, cfg)
		}
		services.InternalServerError(w, r, "Erreur Commit Transaction", services.INTERNAL_ERROR, nil)
		return
	}

	slog.Info("Import global terminé avec succès", "total", len(users))
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, map[string]any{
		"imported": len(users),
	})
}
