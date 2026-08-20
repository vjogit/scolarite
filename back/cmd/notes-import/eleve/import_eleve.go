package eleve

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	"cyb-react/cmd/notes-import/services"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// Import_eleve migre les élèves de MariaDB vers PostgreSQL. Les élèves n'ont
// pas de compte Keycloak : l'application est réservée au personnel. Seule leur
// ligne en base est créée, avec la nature ELEVE.
func Import_eleve(cfg *services.Config) {
	if cfg.Import.MariaDB == "" || cfg.Import.Postgres == "" {
		log.Fatal("Configuration manquante : import.mariadb et import.postgres sont requis dans le YAML")
	}

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
		INSERT INTO "user" (id, "firstName", "lastName", email, "version", type_personne)
		VALUES ($1, $2, $3, $4, 1, 'ELEVE')
		ON CONFLICT (id) DO UPDATE
		SET "firstName" = EXCLUDED."firstName",
		    "lastName" = EXCLUDED."lastName",
			email = EXCLUDED.email,
			type_personne = EXCLUDED.type_personne
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

		_, err := stmt.Exec(id, firstName, lastName, emailVal)
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
