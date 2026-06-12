package promo

import (
	"context"
	"cyb-react/cmd/notes-import/exercice"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SavePromotion sauvegarde les données de la promotion dans PostgreSQL.
// Elle respecte la contrainte : si une donnée existe déjà, on ne fait rien (idempotence).
func SavePromotion(ctx context.Context, db *pgxpool.Pool, data ParsedData) (int32, error) {
	// Vérification du mode dry-run
	if save, ok := ctx.Value("saveDB").(bool); ok && !save {
		return 0, nil
	}

	//  {
	if !data.EstValide {
		return -1, nil
	}

	// 1. Sauvegarde de la Formation
	formationID, err := ensureFormation(ctx, db, data.Formation)
	if err != nil {
		return -1, fmt.Errorf("erreur lors de la sauvegarde de la formation '%s': %w", data.Formation, err)
	}

	// 2. Calcul des dates pour la Promotion (basé sur l'année)
	debut, fin, err := calculateDates(data.Annee)
	if err != nil {
		return -1, fmt.Errorf("erreur de parsing de l'année '%s': %w", data.Annee, err)
	}

	// 3. Sauvegarde de la Promotion
	promotionID, err := ensurePromotion(ctx, db, data.Promotion, formationID, debut, fin)
	if err != nil {
		return -1, fmt.Errorf("erreur lors de la sauvegarde de la promotion '%s': %w", data.Promotion, err)
	}

	// 4. Sauvegarde de l'Option
	optionID, err := ensureOption(ctx, db, data.Option, promotionID)
	if err != nil {
		return -1, fmt.Errorf("erreur lors de la sauvegarde de l'option '%s': %w", data.Option, err)
	}

	// 5. Calcul des dates du semestre (S5 = début promo, +6 mois par semestre)
	semDebut, semFin := calculateSemesterPeriod(debut, data.Semestre)

	semestreID, err := ensureSemestre(ctx, db, data.Semestre, optionID, semDebut, semFin)
	if err != nil {
		return -1, fmt.Errorf("erreur lors de la sauvegarde du semestre '%s': %w", data.Semestre, err)
	}

	return semestreID, nil
}

// SaveUE sauvegarde une Unité d'Enseignement et retourne son ID.
func SaveUE(ctx context.Context, db *pgxpool.Pool, semestreID int32, ue exercice.Ue) (int32, error) {
	if save, ok := ctx.Value("saveDB").(bool); ok && !save {
		return 0, nil
	}
	return ensureUE(ctx, db, ue.UE, semestreID, ue.ECTS)
}

func ensureFormation(ctx context.Context, db *pgxpool.Pool, name string) (int32, error) {
	var id int32
	// On tente d'insérer si n'existe pas, sinon on récupère l'ID existant
	query := `
		WITH ins AS (
			INSERT INTO formation (name) 
			VALUES ($1) 
			ON CONFLICT (name) DO NOTHING 
			RETURNING id
		)
		SELECT id FROM ins
		UNION ALL
		SELECT id FROM formation WHERE name = $1
		LIMIT 1;
	`
	err := db.QueryRow(ctx, query, name).Scan(&id)
	return id, err
}

func ensurePromotion(ctx context.Context, db *pgxpool.Pool, name string, formationID int32, debut, fin time.Time) (int32, error) {
	var id int32
	query := `
		WITH ins AS (
			INSERT INTO promotion (name, formation_id, debut, fin, echelle_gpa, echelle) 
			VALUES ($1, $2, $3, $4, $5, '{16,14,12,10,8}') 
			ON CONFLICT (name) DO NOTHING 
			RETURNING id
		)
		SELECT id FROM ins
		UNION ALL
		SELECT id FROM promotion WHERE name = $1
		LIMIT 1;
	`
	gpa := [...]float64{4, 3.5, 3, 2.5, 2, 0}
	err := db.QueryRow(ctx, query, name, formationID, debut, fin, gpa).Scan(&id)
	return id, err
}

func ensureOption(ctx context.Context, db *pgxpool.Pool, name string, promotionID int32) (int32, error) {
	var id int32
	// Vérifie si existe
	err := db.QueryRow(ctx, "SELECT id FROM option WHERE name=$1 AND promotion_id=$2", name, promotionID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != pgx.ErrNoRows {
		return 0, err
	}
	// Sinon insert
	err = db.QueryRow(ctx, "INSERT INTO option (name, promotion_id) VALUES ($1, $2) RETURNING id", name, promotionID).Scan(&id)
	return id, err
}

func ensureSemestre(ctx context.Context, db *pgxpool.Pool, name string, optionID int32, debut, fin time.Time) (int32, error) {
	var id int32
	// Mappe 'Semestre' vers la table 'periode'
	err := db.QueryRow(ctx, "SELECT id FROM periode WHERE name=$1 AND option_id=$2", name, optionID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != pgx.ErrNoRows {
		return 0, err
	}
	err = db.QueryRow(ctx, "INSERT INTO periode (name, option_id, debut, fin) VALUES ($1, $2, $3, $4) RETURNING id", name, optionID, debut, fin).Scan(&id)
	return id, err
}

func ensureUE(ctx context.Context, db *pgxpool.Pool, name string, periodeID int32, ects float64) (int32, error) {
	var id int32
	err := db.QueryRow(ctx, "SELECT id FROM unite_enseignement WHERE name=$1 AND periode_id=$2", name, periodeID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != pgx.ErrNoRows {
		return 0, err
	}
	err = db.QueryRow(ctx, "INSERT INTO unite_enseignement (name, periode_id, ects) VALUES ($1, $2, $3) RETURNING id", name, periodeID, ects).Scan(&id)
	return id, err
}

func calculateDates(anneeStr string) (time.Time, time.Time, error) {
	annee, err := strconv.Atoi(anneeStr)
	if err != nil {
		// Fallback : Date du jour et +6 mois si l'année est invalide
		now := time.Now().UTC()
		return now, now.AddDate(0, 6, 0), nil
	}

	// Convention : Début = 1er Septembre de l'année
	debut := time.Date(annee, time.September, 1, 0, 0, 0, 0, time.UTC)
	// Convention : Fin = 31 Août dans 3 ans.
	fin := time.Date(annee+3, time.August, 31, 23, 59, 59, 0, time.UTC)

	return debut, fin, nil
}

func calculateSemesterPeriod(promoStart time.Time, semName string) (time.Time, time.Time) {
	// Par défaut, on prend la date de début de promo et une durée de 6 mois
	start := promoStart
	end := start.AddDate(0, 6, 0)

	if len(semName) < 2 || semName[0] != 'S' {
		return start, end
	}

	// Extraction du numéro de semestre (ex: "S5" -> 5)
	semNum, err := strconv.Atoi(semName[1:])
	if err != nil {
		return start, end
	}

	// Logique : S5 est le pivot (date de promo).
	// Chaque semestre ajoute 6 mois.
	// S5 : offset 0
	// S6 : offset 6 mois
	// ...
	offsetMonths := (semNum - 5) * 6

	start = promoStart.AddDate(0, offsetMonths, 0)
	end = start.AddDate(0, 6, 0)

	return start, end
}
