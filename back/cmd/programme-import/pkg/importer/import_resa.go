package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	resaGen "cyb-react/pkg/planning/reservation/gen"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type matiereInfo struct {
	matiereID int32
	periodeID int32
	debut     time.Time
	fin       time.Time
}

func ImportReservations(dbURL string) error {
	ctx := context.Background()

	db, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connexion BDD : %w", err)
	}
	defer db.Close(ctx)

	matieresByName, err := loadMatieres(ctx, db)
	if err != nil {
		return fmt.Errorf("chargement matières : %w", err)
	}

	data, err := os.ReadFile("data/reservations.json")
	if err != nil {
		return fmt.Errorf("lecture reservations.json : %w", err)
	}

	type ResaJSON struct {
		COCLE string `json:"COCLE"`
		PRCLE string `json:"PRCLE"`
		SACLE string `json:"SACLE"`
		DATE  string `json:"DATE"`
		HD    string `json:"HD"`
		HF    string `json:"HF"`
	}
	var resas []ResaJSON
	if err := json.Unmarshal(data, &resas); err != nil {
		return fmt.Errorf("parsing reservations.json : %w", err)
	}

	profsByPRCLE, err := loadProfsByPRCLE(ctx, db)
	if err != nil {
		return fmt.Errorf("chargement profs : %w", err)
	}

	sallesBySACLE, err := loadSallesBySACLE(ctx, db)
	if err != nil {
		return fmt.Errorf("chargement salles : %w", err)
	}

	queries := resaGen.New(db)

	paris, _ := time.LoadLocation("Europe/Paris")
	created, skipped := 0, 0

	for _, r := range resas {
		matiereName, ok := CocleToMatiere[r.COCLE]
		if !ok || matiereName == "" {
			skipped++
			continue
		}

		lower, err := time.ParseInLocation("20060102 1504", r.DATE+" "+r.HD, paris)
		if err != nil {
			log.Printf("horaire invalide (COCLE=%s DATE=%s HD=%s) : %v", r.COCLE, r.DATE, r.HD, err)
			skipped++
			continue
		}
		upper, err := time.ParseInLocation("20060102 1504", r.DATE+" "+r.HF, paris)
		if err != nil {
			log.Printf("horaire invalide (COCLE=%s DATE=%s HF=%s) : %v", r.COCLE, r.DATE, r.HF, err)
			skipped++
			continue
		}

		infos, found := matieresByName[matiereName]
		if !found {
			log.Printf("matière inconnue en BDD (COCLE=%s nom=%q)", r.COCLE, matiereName)
			skipped++
			continue
		}
		info, matched := matchPeriode(infos, lower)
		if !matched {
			log.Printf("aucune période ne couvre %s pour la matière %q (COCLE=%s)", lower.Format("2006-01-02"), matiereName, r.COCLE)
			skipped++
			continue
		}

		mID := info.matiereID
		horaire := pgtype.Range[pgtype.Timestamptz]{
			Lower:     pgtype.Timestamptz{Time: lower, Valid: true},
			Upper:     pgtype.Timestamptz{Time: upper, Valid: true},
			LowerType: pgtype.Inclusive,
			UpperType: pgtype.Inclusive,
			Valid:     true,
		}

		resaID, err := queries.CreateReservation(ctx, resaGen.CreateReservationParams{
			Horaire:      horaire,
			PeriodeID:    info.periodeID,
			MatiereID:    &mID,
			TypeCours:    nil,
			IsDistanciel: false,
			Description:  nil,
		})
		if err != nil {
			log.Printf("erreur insert (COCLE=%s %s %s-%s) : %v", r.COCLE, r.DATE, r.HD, r.HF, err)
			skipped++
			continue
		}

		if userID, ok := profsByPRCLE[r.PRCLE]; ok {
			if err := queries.AddReservationIntervenant(ctx, resaGen.AddReservationIntervenantParams{
				ReservationID: resaID,
				UserID:        userID,
				Horaire:       horaire,
			}); err != nil {
				log.Printf("[WARN] intervenant non associé (PRCLE=%s resaID=%d) : %v", r.PRCLE, resaID, err)
			}
		}

		if salleID, ok := sallesBySACLE[r.SACLE]; ok {
			if err := queries.AddReservationSalle(ctx, resaGen.AddReservationSalleParams{
				ReservationID: resaID,
				SalleID:       salleID,
				Horaire:       horaire,
			}); err != nil {
				log.Printf("[WARN] salle non associée (SACLE=%s resaID=%d) : %v", r.SACLE, resaID, err)
			}
		}

		created++
	}

	fmt.Printf("réservations créées : %d  ignorées : %d\n", created, skipped)
	return nil
}

func loadMatieres(ctx context.Context, db *pgx.Conn) (map[string][]matiereInfo, error) {
	rows, err := db.Query(ctx, `
		SELECT m.id, m.name, p.id, p.debut, p.fin
		FROM matiere m
		JOIN unite_enseignement ue ON ue.id = m.unite_enseignement_id
		JOIN periode p             ON p.id  = ue.periode_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]matiereInfo)
	for rows.Next() {
		var name string
		var info matiereInfo
		var debut, fin pgtype.Timestamptz
		if err := rows.Scan(&info.matiereID, &name, &info.periodeID, &debut, &fin); err != nil {
			return nil, err
		}
		info.debut = debut.Time
		info.fin = fin.Time
		result[name] = append(result[name], info)
	}
	return result, rows.Err()
}

func loadProfsByPRCLE(ctx context.Context, db *pgx.Conn) (map[string]int32, error) {
	data, err := os.ReadFile("data/profs.json")
	if err != nil {
		return nil, fmt.Errorf("lecture profs.json : %w", err)
	}
	type ProfJSON struct {
		PR  string `json:"PR"`
		MEL string `json:"MEL"`
	}
	var profs []ProfJSON
	if err := json.Unmarshal(data, &profs); err != nil {
		return nil, fmt.Errorf("parsing profs.json : %w", err)
	}

	prEmail := make(map[string]string, len(profs))
	for _, p := range profs {
		if p.MEL != "" {
			prEmail[p.PR] = p.MEL
		}
	}

	result := make(map[string]int32, len(prEmail))
	for pr, email := range prEmail {
		var userID int32
		err := db.QueryRow(ctx,
			`SELECT id FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
			email,
		).Scan(&userID)
		if err != nil {
			continue
		}
		result[pr] = userID
	}
	return result, nil
}

func loadSallesBySACLE(ctx context.Context, db *pgx.Conn) (map[string]int32, error) {
	data, err := os.ReadFile("data/salles.json")
	if err != nil {
		return nil, fmt.Errorf("lecture salles.json : %w", err)
	}
	type SalleJSON struct {
		SA  string `json:"SA"`
		NOM string `json:"NOM"`
	}
	var salles []SalleJSON
	if err := json.Unmarshal(data, &salles); err != nil {
		return nil, fmt.Errorf("parsing salles.json : %w", err)
	}

	result := make(map[string]int32, len(salles))
	for _, s := range salles {
		name := strings.TrimSpace(s.NOM)
		if name == "" {
			continue
		}
		var salleID int32
		err := db.QueryRow(ctx,
			`SELECT id FROM salle WHERE LOWER(name) = LOWER($1) LIMIT 1`,
			name,
		).Scan(&salleID)
		if err != nil {
			continue
		}
		result[s.SA] = salleID
	}
	return result, nil
}

func matchPeriode(infos []matiereInfo, date time.Time) (matiereInfo, bool) {
	for _, info := range infos {
		if !date.Before(info.debut) && !date.After(info.fin) {
			return info, true
		}
	}
	if len(infos) == 1 {
		return infos[0], true
	}
	return matiereInfo{}, false
}
