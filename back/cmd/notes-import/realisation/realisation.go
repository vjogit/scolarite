package realisation

import (
	"context"
	"cyb-react/cmd/notes-import/services"
	"database/sql"
	"log"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RealisationData contient les informations d'une réalisation
type RealisationData struct {
	NOCLEUNIK int
	EVCLEUNIK int
	Sujet     string
	Note      float64
}

// GetRealisations récupère les réalisations associées à un exercice donné via CTCLEUNIK.
func GetRealisations(cfg *services.Config, ctCleUnik int) []RealisationData {
	// Connexion à la base de données
	db, err := sql.Open("mysql", cfg.Import.MariaDB)
	if err != nil {
		log.Fatalf("Erreur connexion MariaDB (Realisation): %v", err)
	}
	defer db.Close()

	var results []RealisationData

	// Préparation de la requête pour lister les réalisations
	query := "SELECT NOCLEUNIK, Sujet, noteobtenue, EVCLEUNIK FROM Realisation WHERE CTCLEUNIK = ?"
	stmt, err := db.Prepare(query)
	if err != nil {
		log.Printf("Erreur préparation requête Realisation: %v", err)
		return results
	}
	defer stmt.Close()

	rows, err := stmt.Query(ctCleUnik)
	if err != nil {
		log.Printf("Erreur lecture realisations pour exercice %d: %v", ctCleUnik, err)
		return results
	}
	defer rows.Close()

	for rows.Next() {
		var noCleUnik int
		var sujet sql.NullString
		var note sql.NullFloat64
		var evCLEUNIK int

		if err := rows.Scan(&noCleUnik, &sujet, &note, &evCLEUNIK); err != nil {
			continue
		}

		results = append(results, RealisationData{
			NOCLEUNIK: noCleUnik,
			EVCLEUNIK: evCLEUNIK,
			Sujet:     sujet.String,
			Note:      note.Float64,
		})
	}
	return results
}

// SaveControle sauvegarde les données de reals dans la table note de postgresql.
func SaveControle(ctx context.Context, db *pgxpool.Pool, controleID int32, real RealisationData) error {
	if save, ok := ctx.Value("saveDB").(bool); ok && !save {
		return nil
	}

	// EVCLEUNIK correspond à l'id de l'élève (user_id)
	query := `
		INSERT INTO note (controle_id, user_id, note, version) 
		VALUES ($1, $2, $3, 1)
		ON CONFLICT (controle_id, user_id) DO UPDATE 
		SET note = EXCLUDED.note, version = note.version + 1;
	`
	// On utilise real.EVCLEUNIK comme user_id
	_, err := db.Exec(ctx, query, controleID, real.EVCLEUNIK, real.Note)
	return err
}
