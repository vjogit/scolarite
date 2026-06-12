package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	salleGen "cyb-react/pkg/planning/salle/gen"

	"github.com/jackc/pgx/v5"
)

func ImportSalles(dbURL string) error {
	ctx := context.Background()

	db, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connexion BDD : %w", err)
	}
	defer db.Close(ctx)

	data, err := os.ReadFile("data/salles.json")
	if err != nil {
		return fmt.Errorf("lecture salles.json : %w", err)
	}

	type SalleJSON struct {
		SA       string `json:"SA"`
		NOM      string `json:"NOM"`
		CAPACITE string `json:"CAPACITE"`
		TYPE     string `json:"TYPE"`
	}
	var salles []SalleJSON
	if err := json.Unmarshal(data, &salles); err != nil {
		return fmt.Errorf("parsing salles.json : %w", err)
	}

	queries := salleGen.New(db)
	created, skipped, duplicate := 0, 0, 0

	for _, s := range salles {
		name := strings.TrimSpace(s.NOM)
		if name == "" || name == "-" || name == "--" {
			skipped++
			continue
		}

		capacite, err := strconv.Atoi(strings.TrimSpace(s.CAPACITE))
		if err != nil || capacite == 0 {
			capacite = 1
		}

		var exists bool
		err = db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM salle WHERE LOWER(name) = LOWER($1))`,
			name,
		).Scan(&exists)
		if err != nil {
			return fmt.Errorf("vérification doublon %q : %w", name, err)
		}
		if exists {
			log.Printf("[DOUBLON] %q", name)
			duplicate++
			continue
		}

		var typeSalle *string
		if t := strings.TrimSpace(s.TYPE); t != "" {
			typeSalle = &t
		}

		_, err = queries.CreateSalle(ctx, salleGen.CreateSalleParams{
			Name:       name,
			Capacite:   int32(capacite),
			Equipement: nil,
			TypeSalle:  typeSalle,
			Batiment:   nil,
		})
		if err != nil {
			log.Printf("[ERREUR] %q : %v", name, err)
			skipped++
			continue
		}

		log.Printf("[OK] %q (capacite=%d)", name, capacite)
		created++
	}

	fmt.Printf("salles créées : %d  doublons : %d  ignorées : %d\n", created, duplicate, skipped)
	return nil
}
