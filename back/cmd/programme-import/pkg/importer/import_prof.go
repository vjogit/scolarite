package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"regexp"

	userGen "cyb-react/pkg/user/gen"

	"github.com/jackc/pgx/v5"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

func ImportProfs(dbURL string) error {
	ctx := context.Background()

	db, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connexion BDD : %w", err)
	}
	defer db.Close(ctx)

	data, err := os.ReadFile("data/profs.json")
	if err != nil {
		return fmt.Errorf("lecture profs.json : %w", err)
	}

	type ProfJSON struct {
		PR     string `json:"PR"`
		NOM    string `json:"NOM"`
		PRENOM string `json:"PRENOM"`
		MEL    string `json:"MEL"`
	}
	var profs []ProfJSON
	if err := json.Unmarshal(data, &profs); err != nil {
		return fmt.Errorf("parsing profs.json : %w", err)
	}

	queries := userGen.New(db)
	created, skipped, duplicate := 0, 0, 0

	for _, p := range profs {
		if !emailRegex.MatchString(p.MEL) {
			log.Printf("[SKIP] email invalide : PR=%s NOM=%s MEL=%q", p.PR, p.NOM, p.MEL)
			skipped++
			continue
		}

		var exists bool
		err := db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM "user" WHERE LOWER(email) = LOWER($1))`,
			p.MEL,
		).Scan(&exists)
		if err != nil {
			return fmt.Errorf("vérification doublon %s : %w", p.MEL, err)
		}
		if exists {
			log.Printf("[DOUBLON] %s %s <%s>", p.PRENOM, p.NOM, p.MEL)
			duplicate++
			continue
		}

		_, err = queries.CreateUser(ctx, userGen.CreateUserParams{
			Firstname:    &p.PRENOM,
			Lastname:     &p.NOM,
			Email:        &p.MEL,
			KeycloakID:   nil,
			TypePersonne: "AGENT",
		})
		if err != nil {
			log.Printf("[ERREUR] %s %s <%s> : %v", p.PRENOM, p.NOM, p.MEL, err)
			skipped++
			continue
		}

		log.Printf("[OK] %s %s <%s>", p.PRENOM, p.NOM, p.MEL)
		created++
	}

	fmt.Printf("profs créés : %d  doublons : %d  ignorés (email invalide/erreur) : %d\n",
		created, duplicate, skipped)
	return nil
}
