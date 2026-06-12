package note

import (
	"context"
	"fmt"
	"log"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

const connParams = "postgres://postgres:root@localhost:5432/scolarite"

func createDeterministeRnd() *rand.PCG {
	// Définir une graine fixe (seed)
	// Utiliser la même graine produira toujours la même séquence de nombres.
	seed := uint64(16023743065497375901) // Vous pouvez choisir n'importe quel entier int64

	// Créer un nouveau générateur de nombres aléatoires déterministe avec la graine fixe
	rng := rand.NewPCG(seed, 0)

	return rng

}

type PeriodeRow struct {
	Name     string
	OptionID int
	Debut    time.Time
	Fin      time.Time
}

type ModuleRow struct {
	Name      string
	Ects      float32
	PeriodeID int
}

type MatiereRow struct {
	Name     string
	Heure    float32
	Coeff    float32
	ModuleID int
}

type ControleRow struct {
	Name      string
	Coeff     float32
	MatiereID int
}

type NoteRow struct {
	Note       float32
	ControleID int
	UserID     int
}

func TestBulkNotes(t *testing.T) {
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, connParams)
	if err != nil {
		log.Fatal(err)
	}
	// Début de la transaction
	tx, err := conn.Begin(context.Background())
	if err != nil {
		t.Error(err)
		return
	}
	defer tx.Rollback(context.Background()) // rollback si panic ou erreur

	type Values struct {
		Name   string
		values []int
	}

	valeurTest := []Values{
		{
			Name:   "charge",
			values: []int{50, 10, 8, 4, 10000},
		},
		{
			Name:   "notes",
			values: []int{1, 2, 2, 2, 250},
		},
	}

	choix := 1

	nbPeriodes := valeurTest[choix].values[0]
	nbUes := valeurTest[choix].values[1]
	nbMatieres := valeurTest[choix].values[2]
	nbControles := valeurTest[choix].values[3]
	nbNotes := valeurTest[choix].values[4]

	rng := createDeterministeRnd()

	optionID, err := createRootStructure(ctx, tx)
	if err != nil {
		t.Fatal(err)
	}

	periodeIDs, err := generateAndInsertPeriodes(ctx, tx, nbPeriodes, optionID)
	if err != nil {
		t.Fatal(err)
	}

	ueIDs, err := generateAndInsertUEs(ctx, tx, rng, nbUes, periodeIDs)
	if err != nil {
		t.Fatal(err)
	}

	matiereIDs, err := generateAndInsertMatieres(ctx, tx, rng, nbMatieres, ueIDs)
	if err != nil {
		t.Fatal(err)
	}

	controleIDs, err := generateAndInsertControles(ctx, tx, rng, nbControles, matiereIDs)
	if err != nil {
		t.Fatal(err)
	}

	if err := ensureUsersExist(ctx, tx, nbNotes); err != nil {
		t.Fatal(err)
	}

	if err := generateAndInsertNotes(ctx, tx, rng, nbNotes, controleIDs); err != nil {
		t.Fatal(err)
	}

	// Commit à la fin
	if err := tx.Commit(context.Background()); err != nil {
		t.Error(err)
		return
	}

	fmt.Println("Test de charge terminé avec tables temporaires et COPY FROM.")
}

func createRootStructure(ctx context.Context, tx pgx.Tx) (int, error) {
	var formationID, promotionID, optionID int

	if _, err := tx.Exec(ctx, `DELETE FROM formation WHERE name = $1`, "Formation Test"); err != nil {
		return 0, err
	}

	err := tx.QueryRow(ctx, `INSERT INTO formation (name) VALUES ($1) RETURNING id`, "Formation Test").Scan(&formationID)
	if err != nil {
		return 0, err
	}
	echelle_gpa := []float32{4, 3.5, 3, 2.5, 2, 0}

	err = tx.QueryRow(ctx, `INSERT INTO promotion (name, formation_id, debut, fin, echelle_gpa, echelle, matiere_eliminatoire, value_matiere_eliminatoire ) VALUES ($1, $2, $3, $4, $5, '{16.0, 14.0, 12.0, 10.0, 8.0}', $6, $7) RETURNING id`,
		"Promo Test ", formationID, time.Now(), time.Now().AddDate(1, 0, 0), echelle_gpa, true, 6).Scan(&promotionID)
	if err != nil {
		return 0, err
	}
	err = tx.QueryRow(ctx, `INSERT INTO option (name, promotion_id) VALUES ($1, $2) RETURNING id`, "Option Test ", promotionID).Scan(&optionID)
	if err != nil {
		return 0, err
	}
	return optionID, nil
}

func generateAndInsertPeriodes(ctx context.Context, tx pgx.Tx, nbPeriodes int, optionID int) ([]int, error) {
	var periodes []PeriodeRow
	for i := 1; i <= nbPeriodes; i++ {
		periodes = append(periodes, PeriodeRow{
			Name:     fmt.Sprintf("Période %d", i),
			OptionID: optionID,
			Debut:    time.Now(),                  // Début de chaque période
			Fin:      time.Now().AddDate(0, 0, 1), // Fin de chaque période

		})
	}

	// Table temporaire pour periodes
	_, err := tx.Exec(ctx, `
        CREATE TEMP TABLE tmp_periodes (
            name TEXT,
            option_id INTEGER,
			debut DATE,
    		fin DATE
        ) ON COMMIT DROP;
    `)
	if err != nil {
		return nil, err
	}

	// COPY FROM pour periodes
	_, err = tx.CopyFrom(
		ctx,
		pgx.Identifier{"tmp_periodes"},
		[]string{"name", "option_id", "debut", "fin"},
		pgx.CopyFromSlice(len(periodes), func(i int) ([]interface{}, error) {
			return []interface{}{periodes[i].Name, periodes[i].OptionID, periodes[i].Debut, periodes[i].Fin}, nil
		}),
	)
	if err != nil {
		return nil, err
	}

	// Transfert dans la table finale et récupère les ids générés
	rows, err := tx.Query(ctx, `
        INSERT INTO periode (name, option_id, debut, fin)
        SELECT name, option_id, debut, fin FROM tmp_periodes
        RETURNING id;
    `)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	periodeIDs := make([]int, 0, nbPeriodes)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		periodeIDs = append(periodeIDs, id)
	}
	return periodeIDs, nil
}

func generateAndInsertUEs(ctx context.Context, tx pgx.Tx, rng *rand.PCG, nbUes int, periodeIDs []int) ([]int, error) {
	var modules []ModuleRow

	for _, periodeID := range periodeIDs {
		for j := 1; j <= nbUes; j++ {
			moduleName := fmt.Sprintf("Ue %d_%d", periodeID, j)
			modules = append(modules, ModuleRow{
				Name:      moduleName,
				Ects:      float32(rng.Uint64()%10 + 1),
				PeriodeID: periodeID,
			})
		}
	}

	// Table temporaire pour modules
	_, err := tx.Exec(ctx, `
        CREATE TEMP TABLE tmp_ues (
            name TEXT,
            ects REAL,
            periode_id INTEGER
        ) ON COMMIT DROP;
    `)
	if err != nil {
		return nil, err
	}
	_, err = tx.CopyFrom(
		ctx,
		pgx.Identifier{"tmp_ues"},
		[]string{"name", "ects", "periode_id"},
		pgx.CopyFromSlice(len(modules), func(i int) ([]interface{}, error) {
			return []interface{}{modules[i].Name, modules[i].Ects, modules[i].PeriodeID}, nil
		}),
	)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `
        INSERT INTO unite_enseignement (name, ects, periode_id)
        SELECT name, ects, periode_id FROM tmp_ues
        RETURNING id;
    `)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ueIDs := make([]int, 0, len(periodeIDs)*nbUes)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ueIDs = append(ueIDs, id)
	}
	return ueIDs, nil
}

func generateAndInsertMatieres(ctx context.Context, tx pgx.Tx, rng *rand.PCG, nbMatieres int, ueIDs []int) ([]int, error) {
	var matieres []MatiereRow
	for _, ueID := range ueIDs {
		for k := 1; k <= nbMatieres; k++ {
			matiereName := fmt.Sprintf("Matière %d.%d", ueID, k)
			matieres = append(matieres, MatiereRow{
				Name:     matiereName,
				Heure:    30,
				Coeff:    float32(rng.Uint64()%10 + 1),
				ModuleID: ueID,
			})
		}
	}

	// Table temporaire pour matieres
	_, err := tx.Exec(ctx, `
        CREATE TEMP TABLE tmp_matieres (
            name TEXT,
            heure REAL,
            coeff REAL,
            unite_enseignement_id INTEGER
        ) ON COMMIT DROP;
    `)
	if err != nil {
		return nil, err
	}
	_, err = tx.CopyFrom(
		ctx,
		pgx.Identifier{"tmp_matieres"},
		[]string{"name", "heure", "coeff", "unite_enseignement_id"},
		pgx.CopyFromSlice(len(matieres), func(i int) ([]interface{}, error) {
			return []interface{}{matieres[i].Name, matieres[i].Heure, matieres[i].Coeff, matieres[i].ModuleID}, nil
		}),
	)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `
        INSERT INTO matiere (name, heure, coeff, unite_enseignement_id)
        SELECT name, heure, coeff, unite_enseignement_id FROM tmp_matieres
        RETURNING id;
    `)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	matiereIDs := make([]int, 0, len(ueIDs)*nbMatieres)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		matiereIDs = append(matiereIDs, id)
	}
	return matiereIDs, nil
}

func generateAndInsertControles(ctx context.Context, tx pgx.Tx, rng *rand.PCG, nbControles int, matiereIDs []int) ([]int, error) {
	var controles []ControleRow
	for _, matiereID := range matiereIDs {
		for l := 1; l <= nbControles; l++ {
			controleName := fmt.Sprintf("Controle %d.%d", matiereID, l)
			controles = append(controles, ControleRow{
				Name:      controleName,
				Coeff:     float32(rng.Uint64()%10 + 1),
				MatiereID: matiereID,
			})
		}
	}

	// Table temporaire pour controles
	_, err := tx.Exec(ctx, `
        CREATE TEMP TABLE tmp_controles (
            name TEXT,
            coeff REAL,
            matiere_id INTEGER
        ) ON COMMIT DROP;
    `)
	if err != nil {
		return nil, err
	}
	_, err = tx.CopyFrom(
		ctx,
		pgx.Identifier{"tmp_controles"},
		[]string{"name", "coeff", "matiere_id"},
		pgx.CopyFromSlice(len(controles), func(i int) ([]interface{}, error) {
			return []interface{}{controles[i].Name, controles[i].Coeff, controles[i].MatiereID}, nil
		}),
	)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `
        INSERT INTO controle (name, coeff, matiere_id)
        SELECT name, coeff, matiere_id FROM tmp_controles
		RETURNING id
    `)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	controleIDs := make([]int, 0, len(matiereIDs)*nbControles)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		controleIDs = append(controleIDs, id)
	}
	return controleIDs, nil
}

func ensureUsersExist(ctx context.Context, tx pgx.Tx, nbNotes int) error {
	rows, err := tx.Query(ctx, `
		SELECT needed_id FROM generate_series(1, $1) AS needed_id
		WHERE needed_id NOT IN (SELECT id FROM "user")
	`, nbNotes)
	if err != nil {
		return err
	}
	var missingUserIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return err
		}
		missingUserIDs = append(missingUserIDs, id)
	}
	rows.Close()

	if len(missingUserIDs) > 0 {
		_, err := tx.Exec(ctx, `
        CREATE TEMP TABLE tmp_users (
            id INTEGER,
            "firstName" TEXT,
            "lastName" TEXT,
            email TEXT,
            version INTEGER,
            roles TEXT[]
        ) ON COMMIT DROP;`)
		if err != nil {
			return err
		}
		_, err = tx.CopyFrom(
			ctx,
			pgx.Identifier{"tmp_users"},
			[]string{"id", "firstName", "lastName", "email", "version", "roles"},
			pgx.CopyFromSlice(len(missingUserIDs), func(i int) ([]interface{}, error) {
				uid := missingUserIDs[i]
				return []interface{}{uid, fmt.Sprintf("User%d", uid), "Test", fmt.Sprintf("user%d@test.com", uid), 1, []string{"ELEVE"}}, nil
			}),
		)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
        INSERT INTO "user" (id, "firstName", "lastName", email, version, roles)
        SELECT id, "firstName", "lastName", email, version, roles FROM tmp_users;`)
		if err != nil {
			return err
		}
	}

	// 6. Mise à jour de la séquence PostgreSQL
	// Important car on a inséré manuellement des IDs, la séquence automatique doit être synchronisée pour les futurs inserts
	log.Println("Mise à jour de la séquence 'user_id_seq'...")
	// Note: pg_get_serial_sequence prend le nom de la table et de la colonne
	// Correction : Utilisez QueryRow et consommez le résultat pour fermer la connexion.
	var newSeq int64
	err = tx.QueryRow(ctx, `SELECT setval(pg_get_serial_sequence('"user"', 'id'), coalesce(max(id), 0) + 1, false) FROM "user"`).Scan(&newSeq)
	if err != nil {
		log.Printf("Attention : %v", err)
	}
	return nil
}

func generateAndInsertNotes(ctx context.Context, tx pgx.Tx, rng *rand.PCG, nbNotes int, controleIDs []int) error {
	var notes []NoteRow
	for _, controleID := range controleIDs {
		for l := 1; l <= nbNotes; l++ {
			notes = append(notes, NoteRow{
				Note:       float32(rng.Uint64()%20 + 1), // exemple de note entre 10 et 20
				ControleID: controleID,
				UserID:     l,
			})
		}
	}

	// Table temporaire pour notes
	_, err := tx.Exec(ctx, `
    CREATE TEMP TABLE tmp_notes (
        note REAL,
        controle_id INTEGER,
        user_id INTEGER
    ) ON COMMIT DROP;
   `)
	if err != nil {
		return err
	}

	// COPY FROM pour notes
	_, err = tx.CopyFrom(
		ctx,
		pgx.Identifier{"tmp_notes"},
		[]string{"note", "controle_id", "user_id"},
		pgx.CopyFromSlice(len(notes), func(i int) ([]interface{}, error) {
			return []interface{}{notes[i].Note, notes[i].ControleID, notes[i].UserID}, nil
		}),
	)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
        INSERT INTO note (note, controle_id, user_id)
        SELECT note, controle_id, user_id from tmp_notes;
    `)
	if err != nil {
		return err
	}
	return nil
}
