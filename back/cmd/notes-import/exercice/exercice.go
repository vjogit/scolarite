package exercice

import (
	"context"
	"cyb-react/cmd/notes-import/services"
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ExerciceData contient les informations d'un exercice importé
type ExerciceData struct {
	CTCLEUNIK   int
	Nom         string
	Coefficient float64
}

type Ue struct {
	CTCLEUNIK int
	UE        string
	ECTS      float64
	P0CLEUNIK int // Clé de la promotion parente
	Excercice []ExerciceData
}

// AssignmentStrategy définit la signature d'une fonction capable d'attribuer un nom d'UE
// à partir d'un nom de contrôle et de la liste des UEs existantes.
type AssignmentStrategy func(nomControle string, existingUEs map[string]*Ue) string

// GetExercices récupère les exercices associés à une promotion donnée via P0CLEUNIK
func GetExercices(cfg *services.Config, p0CleUnik int, strategy AssignmentStrategy) []Ue { // Connexion à la base de données
	db, err := sql.Open("mysql", cfg.Import.MariaDB)
	if err != nil {
		log.Fatalf("Erreur connexion MariaDB (Exercice): %v", err)
	}
	defer db.Close()

	// Préparation de la requête
	// NOTE: J'assume ici que la table s'appelle 'Exercice' et possède les colonnes 'ID' et 'Nom'.
	// Adaptez la requête selon votre schéma réel (ex: IDExercice, Libelle, etc.)
	query := `
		SELECT e.CTCLEUNIK, e.Nom, e.coefficient, t.nom
		FROM Exercice e 
		LEFT JOIN TypeExercice t ON e.IDTypeExercice = t.IDTypeExercice 
		WHERE e.P0CLEUNIK = ?`
	stmt, err := db.Prepare(query)
	if err != nil {
		log.Printf("Erreur préparation requête Exercice: %v", err)
		return nil
	}
	defer stmt.Close()

	rows, err := stmt.Query(p0CleUnik)
	if err != nil {
		log.Printf("Erreur lecture exercices pour promo %d: %v", p0CleUnik, err)
		return nil
	}
	defer rows.Close()

	// 1. Détection des UEs et stockage des contrôles
	ueMap := make(map[string]*Ue)
	var controles []ExerciceData

	// Structure pour définir une correction avec validation de l'ancien nom
	type Correction struct {
		ExpectedOriginal string
		NewName          string
	}

	// Map des corrections manuelles (ID -> Correction) pour corriger les erreurs de saisie en BDD
	corrections := map[int]Correction{
		17590: {ExpectedOriginal: "9 4B - MÉTHODES ET MISE EN ŒUVRE DES STRUCTURES EN BOIS", NewName: "9.4B - MÉTHODES ET MISE EN ŒUVRE DES STRUCTURES EN BOIS"},
		9409:  {ExpectedOriginal: "ISERM : 8:6 : TRAITEMENT MECANIQUE : A. FOISSE", NewName: "ISERM : 8.6 : TRAITEMENT MECANIQUE : A. FOISSE"},
		8449:  {ExpectedOriginal: "8;5 - THERMIQUE DU BATIMENT", NewName: "8.5 - THERMIQUE DU BATIMENT"},
		7828:  {ExpectedOriginal: "9;1 - CALCUL ET CONCEPTION DES STRUCTURES EN BETON PRECONTRAINT", NewName: "9.1 - CALCUL ET CONCEPTION DES STRUCTURES EN BETON PRECONTRAINT"},
		3956:  {ExpectedOriginal: "GC 7.1GÉOLOGIE DE L’INGÉNIEUR 1 / GEOLOGY FOR ENGINEER 1", NewName: "GC 7.1 GÉOLOGIE DE L’INGÉNIEUR 1 / GEOLOGY FOR ENGINEER 1"},
		9910:  {ExpectedOriginal: "TC 5- 7 ANGLAIS -", NewName: "TC 5-7 ANGLAIS -"},
		9462:  {ExpectedOriginal: "TC 6- 4 MECANIQUE GENERALE -", NewName: "TC 6-4 MECANIQUE GENERALE -"},
		10065: {ExpectedOriginal: "TC 6 -1  ANALYSE NUMERIQUE - QCM 1 -", NewName: "TC 6-1  ANALYSE NUMERIQUE - QCM 1"},
		14810: {ExpectedOriginal: "8;9-EE-ENTREPRISE", NewName: "8.9-EE-ENTREPRISE"},
	}

	for rows.Next() {
		var id int
		var nom sql.NullString
		var coeff sql.NullFloat64
		var typeNom sql.NullString

		if err := rows.Scan(&id, &nom, &coeff, &typeNom); err != nil {
			continue
		}

		// Application des corrections manuelles avec vérification
		if corr, ok := corrections[id]; ok {
			if nom.String == corr.ExpectedOriginal {
				nom.String = corr.NewName
			} else {
				log.Printf("WARN: Correction ID %d ignorée. Attendu: '%s', Reçu: '%s'", id, corr.ExpectedOriginal, nom.String)
			}
		}

		switch typeNom.String {
		case "ECTS", "ECTS + REMARQUES", "CONTROLE + ESTIMATION CREDIT":
			ue := Ue{
				CTCLEUNIK: id,
				UE:        nom.String,
				ECTS:      coeff.Float64,
				P0CLEUNIK: p0CleUnik,
				Excercice: []ExerciceData{},
			}
			ueMap[nom.String] = &ue
		case "CONTROLE":
			controles = append(controles, ExerciceData{
				CTCLEUNIK:   id,
				Nom:         nom.String,
				Coefficient: coeff.Float64,
			})
		default:
			fmt.Println("type non pris en compte : ", typeNom.String, id)
		}
	}

	// ========================================================================
	// 2. Affectation des contrôles via la STRATÉGIE injectée
	// ========================================================================
	for _, ctrl := range controles {
		// APPEL DE LA FONCTION DÉPORTÉE
		// On laisse la stratégie décider du nom de l'UE
		nomUE := strategy(ctrl.Nom, ueMap)

		if _, ok := ueMap[nomUE]; !ok {
			ueMap[nomUE] = &Ue{
				UE:        nomUE,
				ECTS:      0,
				P0CLEUNIK: p0CleUnik,
				Excercice: []ExerciceData{},
			}
		}
		ueMap[nomUE].Excercice = append(ueMap[nomUE].Excercice, ctrl)
	}

	// 3. Conversion de la map en slice pour le retour
	var result []Ue
	for _, ue := range ueMap {
		result = append(result, *ue)
	}

	return result
}

// SaveExercice sauvegarde un exercice (Matière + Contrôle).
func SaveExercice(ctx context.Context, db *pgxpool.Pool, ueID int32, ex ExerciceData) (int32, error) {
	if save, ok := ctx.Value("saveDB").(bool); ok && !save {
		return 0, nil
	}

	// Sauvegarde Exercice -> table matiere
	matiereID, err := ensureMatiere(ctx, db, ex.Nom, ueID, ex.Coefficient)
	if err != nil {
		return 0, fmt.Errorf("erreur sauvegarde Matiere '%s': %w", ex.Nom, err)
	}

	// Création d'un contrôle par défaut -> table controle
	// On utilise le nom de la matière et un coeff de 1.0 par défaut pour le contrôle
	return ensureControle(ctx, db, ex.Nom, matiereID, 1.0)
}

func ensureMatiere(ctx context.Context, db *pgxpool.Pool, name string, ueID int32, coeff float64) (int32, error) {
	var id int32
	err := db.QueryRow(ctx, "SELECT id FROM matiere WHERE name=$1 AND unite_enseignement_id=$2", name, ueID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != pgx.ErrNoRows {
		return 0, err
	}
	err = db.QueryRow(ctx, "INSERT INTO matiere (name, unite_enseignement_id, coeff, heure) VALUES ($1, $2, $3, 1) RETURNING id", name, ueID, coeff).Scan(&id)
	return id, err
}

func ensureControle(ctx context.Context, db *pgxpool.Pool, name string, matiereID int32, coeff float64) (int32, error) {
	var id int32
	err := db.QueryRow(ctx, "SELECT id FROM controle WHERE name=$1 AND matiere_id=$2", name, matiereID).Scan(&id)
	if err == nil {
		return id, nil // Déjà existant
	}
	err = db.QueryRow(ctx, "INSERT INTO controle (name, matiere_id, coeff) VALUES ($1, $2, $3) RETURNING id", name, matiereID, coeff).Scan(&id)
	return id, err
}
