package promo

import (
	"cyb-react/cmd/notes-import/services"
	"database/sql"
	"log"
	"sort"

	_ "github.com/go-sql-driver/mysql"
)

// --- 1. STRUCTURES DE DONNÉES ---

// ParsedData : Le résultat standardisé que l'on veut obtenir pour tout le monde
type ParsedData struct {
	P0CLEUNIK    int
	OriginalName string
	Semestre     string // ex: S5
	Formation    string // ex: FCD
	Promotion    string // ex: P20
	Annee        string // ex: 2023
	Option       string // ex: FCD (souvent identique formation)
	EstValide    bool   // Pour savoir si le parsing a réussi
}

// ParserFuncPromo : Signature que toutes vos futures fonctions de parsing devront respecter
type ParserFunc func(nomPromo string) ParsedData

// --- 3. LOGIQUE PRINCIPALE (MOTEUR) ---

func Import_promo(cfg *services.Config, niveauNom string, parser ParserFunc) []ParsedData {
	// A. Connexion BDD
	db, err := sql.Open("mysql", cfg.Import.MariaDB)
	if err != nil {
		log.Fatalf("Erreur connexion: %v", err)
	}
	defer db.Close()

	// C. Collecte des résultats pour ce niveau
	results := processLevel(db, niveauNom, parser)

	// D. Tri des résultats
	sort.Slice(results, func(i, j int) bool {
		if results[i].Formation != results[j].Formation {
			return results[i].Formation < results[j].Formation
		}
		if results[i].Promotion != results[j].Promotion {
			return results[i].Promotion < results[j].Promotion
		}
		if results[i].Option != results[j].Option {
			return results[i].Option < results[j].Option
		}
		if results[i].Semestre != results[j].Semestre {
			return results[i].Semestre > results[j].Semestre
		}
		return results[i].Annee < results[j].Annee
	})
	return results
}

// processLevel : Fonction générique qui récupère les lignes d'un niveau et applique le parser
func processLevel(db *sql.DB, nomNiveau string, parser ParserFunc) []ParsedData {
	var results []ParsedData

	// Requête SQL paramétrée pour récupérer uniquement ce niveau
	query := `
		SELECT p.nom, p.P0CLEUNIK
		FROM promos p
		INNER JOIN Niveau n ON p.IDNiveau = n.IDNiveau
		WHERE n.nom = ?
		ORDER BY p.datedebut DESC
	`

	rows, err := db.Query(query, nomNiveau)
	if err != nil {
		log.Printf("Erreur requête pour %s: %v", nomNiveau, err)
		return results
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var nomPromo string
		var p0CleUnik int
		if err := rows.Scan(&nomPromo, &p0CleUnik); err != nil {
			continue
		}

		// APPEL MAGIQUE : On utilise la fonction passée en paramètre
		resultat := parser(nomPromo)
		resultat.P0CLEUNIK = p0CleUnik

		// Affichage
		if resultat.EstValide {
			results = append(results, resultat)
		}
		count++
	}

	return results
}
