package promo

import (
	"fmt"
	"regexp"
)

func ParseNUCLEAIRE(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "DIVERS",
		Option:       "commun",
	}

	// Regex pour le format : "S10-NUC-2011"
	// Capture : 1=Semestre, 2=Année
	reStd := regexp.MustCompile(`^S(\d+)-NUC-(\d{4})$`)

	if match := reStd.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Semestre = "S" + match[1]
		data.Annee = match[2]
		data.Promotion = fmt.Sprintf("NUC-%s", match[2])
	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
