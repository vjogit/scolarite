package promo

import (
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

// parseFCD traite "FORMATION CONTINUE DIPLOMANTE"
// Nouveau format cible : "S7-FCD_29-2006"
// 1. Semestre (S7)
// 2. Formation_Promo (FCD_29)
// 3. Année (2006)
func ParseFCD(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Option:       "commun",
	}

	// 1. Découpage global par les tirets "-"
	// On s'attend à obtenir ["S7", "FCD_29", "2006"]
	parts := strings.Split(nom, "-")

	// On vérifie qu'on a au moins 3 parties (Semestre, BlocCentral, Année)
	if len(parts) >= 3 {
		data.Semestre = strings.TrimSpace(parts[0])

		// L'année est généralement la dernière partie
		data.Annee = strings.TrimSpace(parts[len(parts)-1])

		// 2. Traitement du bloc central "FCD_29"
		middlePart := strings.TrimSpace(parts[1])

		// On sépare la Formation de la Promotion via l'underscore "_"
		subParts := strings.Split(middlePart, "_")

		if len(subParts) >= 2 {
			data.Formation = subParts[0]          // "FCD"
			data.Promotion = "FCD-" + subParts[1] // "29"
		} else {
			// Cas de secours si l'underscore est absent
			data.Formation = middlePart
			data.Promotion = "?"
		}

		data.EstValide = true
	} else {
		// Gestion des cas qui ne respectent pas le format "A-B-C"
		data.Formation = "Format Incorrect"
	}

	return data
}
