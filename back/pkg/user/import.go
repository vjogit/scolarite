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

	"github.com/go-chi/render"
	"github.com/xuri/excelize/v2"
	"golang.org/x/sync/errgroup"
)

// Format du fichier d'import (première feuille, ligne 1 = en-têtes) :
//
//	Nom | Prénom | Email | Nature | Rôles
//
//   - Nature : ELEVE ou AGENT (vide = AGENT). La nature est persistée en base,
//     c'est elle qui distingue un élève d'un agent.
//   - Rôles : liste séparée par des virgules, parmi services.AssignableRoles.
//     Les rôles ne concernent que les agents et ne vont que dans Keycloak.
//     Un élève ne doit en porter aucun.
//
// Il n'y a plus de colonne mot de passe : l'application n'en définit jamais.
// Chaque agent créé reçoit un courriel Keycloak UPDATE_PASSWORD pour choisir
// le sien. Un échec d'envoi n'annule pas la création : le compte est conservé
// sans mot de passe utilisable et l'échec est signalé dans la réponse
// (email_echecs), les autres comptes ne sont pas affectés.
type UserImport struct {
	FirstName    string
	LastName     string
	Email        string
	TypePersonne string
	Roles        []string
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
		services.InvalidRequestError(w, r, "Format Excel invalide", services.NO_INFORMATION, nil)
		return
	}
	defer xlsx.Close()

	sheetName := xlsx.GetSheetName(0)
	rows, err := xlsx.GetRows(sheetName)
	if err != nil {
		services.InvalidRequestError(w, r, "Erreur lecture feuille Excel", services.NO_INFORMATION, nil)
		return
	}

	// Colonnes attendues : Nom | Prénom | Email | Nature | Rôles
	var users []UserImport
	var lignesInvalides []string
	for i, row := range rows[1:] { // Ignorer la ligne d'en-têtes
		numLigne := i + 2
		get := func(col int) string {
			if col < len(row) {
				return strings.TrimSpace(row[col])
			}
			return ""
		}
		lastName := get(0)
		firstName := get(1)
		email := get(2)
		natureRaw := get(3)
		rolesRaw := get(4)

		if lastName == "" && firstName == "" && email == "" {
			continue // ligne vide
		}
		if email == "" {
			lignesInvalides = append(lignesInvalides, fmt.Sprintf("ligne %d : email manquant", numLigne))
			continue
		}

		typePersonne, err := normalizeTypePersonne(natureRaw)
		if err != nil {
			lignesInvalides = append(lignesInvalides, fmt.Sprintf("ligne %d : %v", numLigne, err))
			continue
		}

		var roles []string
		for r := range strings.SplitSeq(rolesRaw, ",") {
			if role := strings.TrimSpace(r); role != "" {
				roles = append(roles, role)
			}
		}
		if err := validateRoles(roles); err != nil {
			lignesInvalides = append(lignesInvalides, fmt.Sprintf("ligne %d : %v", numLigne, err))
			continue
		}
		if typePersonne == TypePersonneEleve && len(roles) > 0 {
			lignesInvalides = append(lignesInvalides, fmt.Sprintf("ligne %d : un élève ne porte pas de rôle applicatif", numLigne))
			continue
		}

		users = append(users, UserImport{
			FirstName:    firstName,
			LastName:     lastName,
			Email:        email,
			TypePersonne: typePersonne,
			Roles:        roles,
		})
	}

	if len(lignesInvalides) > 0 {
		services.InvalidRequestError(w, r, "fichier d'import invalide", services.VALIDATION_ERROR,
			map[string]interface{}{"lignes": lignesInvalides})
		return
	}

	ctx := r.Context()

	// 3. Auth Keycloak une seule fois pour tout l'import
	kcClient, accessToken, realm, err := newKeycloakAdminClient(ctx, cfg)
	if err != nil {
		slog.Error("auth Keycloak impossible pour l'import", "err", err)
		services.InternalServerError(w, r, "Erreur auth Keycloak", services.NO_INFORMATION, nil)
		return
	}

	// 4. Création Keycloak en parallèle (N workers) — agents uniquement :
	// les élèves n'ont pas de compte Keycloak, seulement une ligne en base.
	results := make([]kcUserResult, len(users))
	var mu sync.Mutex
	var createdKeycloakIDs []string

	g, gCtx := errgroup.WithContext(ctx)
	sem := make(chan struct{}, importWorkers)

	for i, u := range users {
		if u.TypePersonne != TypePersonneAgent {
			continue
		}
		i, u := i, u
		g.Go(func() error {
			select {
			case sem <- struct{}{}:
			case <-gCtx.Done():
				return gCtx.Err()
			}
			defer func() { <-sem }()

			input := gen.User{
				FirstName:    &u.FirstName,
				LastName:     &u.LastName,
				Email:        &u.Email,
				TypePersonne: u.TypePersonne,
			}

			kcID, created, err := createKeycloakUserWithClient(gCtx, kcClient, accessToken, realm, &input, u.Roles)
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
		slog.Error("import Keycloak en échec", "err", err)
		services.InternalServerError(w, r, "Erreur lors de la création des comptes", services.NO_INFORMATION, nil)
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
		var kcIDParam *string
		if kcID := results[i].kcID; kcID != "" {
			kcIDParam = &kcID
		}
		_, err = qtx.CreateUser(ctx, gen.CreateUserParams{
			Firstname:    &u.FirstName,
			Lastname:     &u.LastName,
			Email:        &u.Email,
			KeycloakID:   kcIDParam,
			TypePersonne: u.TypePersonne,
		})
		if err != nil {
			for _, id := range createdKeycloakIDs {
				_ = deleteKeycloakUser(context.Background(), id, cfg)
			}
			slog.Error("insertion user impossible pendant l'import", "email", u.Email, "err", err)
			services.InternalServerError(w, r, "Erreur DB pour "+u.Email, services.NO_INFORMATION, nil)
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

	// 6. Courriels UPDATE_PASSWORD, après commit : un échec d'envoi n'annule
	// rien, il est signalé compte par compte dans la réponse. Ces comptes
	// restent sans mot de passe utilisable jusqu'à un nouvel envoi.
	var emailEchecs []string
	for i, u := range users {
		if results[i].kcID == "" || !results[i].created {
			continue
		}
		if err := sendPasswordEmail(ctx, kcClient, accessToken, realm, results[i].kcID); err != nil {
			slog.Error("envoi du courriel de définition de mot de passe impossible",
				"email", u.Email, "err", err)
			emailEchecs = append(emailEchecs, u.Email)
		}
	}

	slog.Info("Import global terminé", "total", len(users), "email_echecs", len(emailEchecs))
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, map[string]any{
		"imported":     len(users),
		"email_echecs": emailEchecs,
	})
}
