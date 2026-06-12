package promo

import (
	"fmt"
	"regexp"
	"strings"
)

func ParseMASTER(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "DIVERS",
		Option:       "commun",
	}

	// 1. Regex CTN : "CTN 2011-2012"
	// Capture : 1=Debut, 2=Fin
	reCTN := regexp.MustCompile(`^CTN\s+(\d{4})-(\d{4})$`)

	// 2. Regex MASTERE avec année : "MASTERE SIE 2013-2014"
	// Capture : 1=Option, 2=Debut, 3=Fin
	reMastereYear := regexp.MustCompile(`^MASTERE\s+(.+?)\s+(\d{4})-(\d{4})$`)

	// 3. Regex MASTERE sans année : "MASTERE SIE"
	// Capture : 1=Option
	reMastereSimple := regexp.MustCompile(`^MASTERE\s+(.+)$`)

	if match := reCTN.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Option = "CTN"
		data.Annee = match[1]
		data.Semestre = "annee"
		data.Promotion = fmt.Sprintf("CTN-%s", match[1])
	} else if match := reMastereYear.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Option = strings.TrimSpace(match[1])
		data.Annee = match[2]
		data.Semestre = "annee"
		data.Promotion = fmt.Sprintf("%s-%s", data.Option, match[2])
	} else if match := reMastereSimple.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Option = strings.TrimSpace(match[1])
		data.Annee = "2012"
		data.Semestre = "annee"
		data.Promotion = fmt.Sprintf("%s-%s", data.Option, data.Annee)
	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
