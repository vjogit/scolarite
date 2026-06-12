package eleve

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"cyb-react/cmd/notes-import/services"

	"github.com/Nerzal/gocloak/v13"
	_ "github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

func Import_eleve(cfg *services.Config) {
	if cfg.Import.MariaDB == "" || cfg.Import.Postgres == "" {
		log.Fatal("Configuration manquante : import.mariadb et import.postgres sont requis dans le YAML")
	}

	// Initialisation Keycloak
	parts := strings.Split(cfg.Keycloak.Realm, "/")
	realm := parts[len(parts)-1]
	kcClient := gocloak.NewClient(cfg.Keycloak.Host)
	ctx := context.Background()

	token, err := kcClient.LoginClient(ctx, cfg.Keycloak.Backend_client_id, cfg.Keycloak.Backend_client_secret, realm)
	if err != nil {
		log.Fatalf("Erreur login Keycloak : %v", err)
	}
	tokenReceivedAt := time.Now()

	// 1. Connexion à MariaDB (Source)
	srcDB, err := sql.Open("mysql", cfg.Import.MariaDB)
	if err != nil {
		log.Fatalf("Erreur d'ouverture de connexion MariaDB : %v", err)
	}
	defer srcDB.Close()

	if err := srcDB.Ping(); err != nil {
		log.Fatalf("Erreur de connexion à MariaDB : %v", err)
	}
	log.Println("Connecté à MariaDB")

	// 2. Connexion à PostgreSQL (Destination)
	dstDB, err := sql.Open("pgx", cfg.Import.Postgres)
	if err != nil {
		log.Fatalf("Erreur d'ouverture de connexion PostgreSQL : %v", err)
	}
	defer dstDB.Close()

	if err := dstDB.Ping(); err != nil {
		log.Fatalf("Erreur de connexion à PostgreSQL : %v", err)
	}
	log.Println("Connecté à PostgreSQL")

	// 3. Lecture des données depuis MariaDB
	// On sélectionne les champs correspondants : EVCLEUNIK -> id, nom -> lastName, prenom -> firstName, mel -> email
	rows, err := srcDB.Query("SELECT EVCLEUNIK, nom, prenom, mel FROM eleves")
	if err != nil {
		log.Fatalf("Erreur lors de la requête SELECT sur MariaDB : %v", err)
	}
	defer rows.Close()

	// 4. Préparation de l'insertion dans PostgreSQL
	// On utilise "user" avec des guillemets car c'est un mot réservé
	// On gère les conflits sur l'ID (ON CONFLICT DO UPDATE) pour mettre à jour si l'utilisateur existe déjà
	query := `
		INSERT INTO "user" (id, "firstName", "lastName", email, "version", roles, keycloak_id) 
		VALUES ($1, $2, $3, $4, 1, '{ELEVE}', $5)
		ON CONFLICT (id) DO UPDATE 
		SET "firstName" = EXCLUDED."firstName", 
		    "lastName" = EXCLUDED."lastName", 
			email = EXCLUDED.email,
			roles = EXCLUDED.roles,
			keycloak_id = EXCLUDED.keycloak_id
	`
	stmt, err := dstDB.Prepare(query)
	if err != nil {
		log.Fatalf("Erreur lors de la préparation de la requête INSERT : %v", err)
	}
	defer stmt.Close()

	// 5. Boucle de migration
	count := 0
	errorsCount := 0

	for rows.Next() {
		var id int
		var nom, prenom, mel sql.NullString

		if err := rows.Scan(&id, &nom, &prenom, &mel); err != nil {
			log.Printf("Erreur de scan (ID inconnu) : %v", err)
			continue
		}

		// Nettoyage et conversion des données
		firstName := normalizeName(prenom.String)
		lastName := normalizeName(nom.String)
		email := strings.TrimSpace(mel.String)

		// Gestion de l'email vide ou NULL pour respecter la contrainte UNIQUE
		var emailVal interface{} = email
		if email == "" {
			emailVal = nil
		}

		// Gestion Keycloak
		var keycloakID interface{} = nil
		if email != "" {
			// Vérification et rafraîchissement du token si nécessaire (marge de 30s)
			if time.Since(tokenReceivedAt).Seconds() > float64(token.ExpiresIn-30) {
				token, err = kcClient.LoginClient(ctx, cfg.Keycloak.Backend_client_id, cfg.Keycloak.Backend_client_secret, realm)
				if err != nil {
					log.Fatalf("Erreur lors du rafraîchissement du token Keycloak : %v", err)
				}
				tokenReceivedAt = time.Now()
			}

			kID, err := syncKeycloakUser(ctx, kcClient, token.AccessToken, realm, firstName, lastName, email)
			if err != nil {
				log.Printf("Erreur Keycloak pour %s (%d %s %s): %v", email, id, firstName, lastName, err)
				errorsCount++
			} else {
				keycloakID = kID
			}
		}

		_, err := stmt.Exec(id, firstName, lastName, emailVal, keycloakID)
		if err != nil {
			// On log l'erreur mais on continue (ex: doublon d'email sur un autre ID)
			log.Printf("Erreur d'insertion pour l'élève ID %d (%s %s) : %v", id, firstName, lastName, err)
			errorsCount++
			continue
		}

		count++
		if count%100 == 0 {
			fmt.Printf("Traitement de %d élèves...\r", count)
		}
	}

	if err := rows.Err(); err != nil {
		log.Fatalf("Erreur lors de l'itération des lignes : %v", err)
	}

	fmt.Printf("\nMigration terminée. %d élèves importés/mis à jour. %d erreurs.\n", count, errorsCount)

}

func syncKeycloakUser(ctx context.Context, client *gocloak.GoCloak, token, realm, firstName, lastName, email string) (string, error) {
	// 1. Vérifier si l'utilisateur existe déjà
	users, err := client.GetUsers(ctx, token, realm, gocloak.GetUsersParams{
		Username: gocloak.StringP(email),
		Exact:    gocloak.BoolP(true),
	})
	if err != nil {
		return "", fmt.Errorf("recherche user: %w", err)
	}

	var userID string
	if len(users) > 0 {
		userID = *users[0].ID
	} else {
		// 2. Création
		user := gocloak.User{
			Username:      gocloak.StringP(email),
			Email:         gocloak.StringP(email),
			FirstName:     gocloak.StringP(firstName),
			LastName:      gocloak.StringP(lastName),
			Enabled:       gocloak.BoolP(true),
			EmailVerified: gocloak.BoolP(true),
		}
		id, err := client.CreateUser(ctx, token, realm, user)
		if err != nil {
			return "", fmt.Errorf("création user: %w", err)
		}
		userID = id

		// 3. Mot de passe temporaire (uniquement à la création)
		if err := client.SetPassword(ctx, token, userID, realm, "passwordTemp123!", false); err != nil {
			log.Printf("Attention: impossible de définir le mot de passe pour %s: %v", email, err)
		}
	}

	// 4. Ajout du rôle ELEVE (idempotent)
	roleName := "ELEVE"
	role, err := client.GetRealmRole(ctx, token, realm, roleName)
	if err != nil {
		return userID, fmt.Errorf("récupération rôle %s: %w", roleName, err)
	}
	if err := client.AddRealmRoleToUser(ctx, token, realm, userID, []gocloak.Role{*role}); err != nil {
		return userID, fmt.Errorf("ajout rôle %s: %w", roleName, err)
	}

	return userID, nil
}

func normalizeName(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "-")
	if s == "" {
		return ""
	}
	s = strings.ToLower(s)
	// cases.Title gère correctement les séparateurs (ex: jean-pierre -> Jean-Pierre)
	return cases.Title(language.French).String(s)
}
