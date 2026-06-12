package promo

import (
	"fmt"
	"regexp"
)

func ParseCESSEM(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "DIVERS",
		Option:       "commun",
	}

	// Regex pour le format : "CESSEM 2011-2012"
	// Capture : 1=Debut, 2=Fin
	reStd := regexp.MustCompile(`^CESSEM\s+(\d{4})-(\d{4})$`)

	if match := reStd.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Annee = match[1]
		data.Semestre = "annee"
		data.Promotion = fmt.Sprintf("CESSEM-%s", match[1])
	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
