package promo

import (
	"fmt"
	"regexp"
	"strconv"
)

func ParseLGEI(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "FIG",
		Option:       "LGEI",
	}

	// 1. Regex Mastère : "S10-MASTERE SIE-2014"
	// On teste ce cas en premier car le format standard est plus générique et pourrait matcher par erreur.
	// S(\d+)       : Semestre (ex: 10)
	// -MASTERE\s+  : Marqueur fixe avec espace obligatoire
	// (.*?)        : Option (ex: SIE)
	// -(\d{4})     : Année
	reMastere := regexp.MustCompile(`^S(\d+)\s*-\s*MASTERE\s+(.*?)\s*-\s*(\d{4})(?:-\d{4})?$`)

	// 2. Regex Standard : "S8-MRE-2008"
	reStd := regexp.MustCompile(`^S(\d+)-(.*?)-(\d{4})$`)

	if match := reMastere.FindStringSubmatch(nom); match != nil {
		// --- CAS MASTERE ---
		data.EstValide = true
		data.Semestre = "S" + match[1]
		data.Option = match[2] // ex: "SIE"
		data.Annee = match[3]
		data.Formation = "Mastère"
		data.Promotion = fmt.Sprintf("MAS-%s", data.Annee)

	} else if match := reStd.FindStringSubmatch(nom); match != nil {
		// --- CAS CLASSIQUE ---
		data.EstValide = true

		semNumStr := match[1]
		data.Semestre = "S" + semNumStr
		data.Option = match[2] // ex: "MRE"
		data.Annee = match[3]

		// Calcul de la Promo FIG (Logique standard)
		annee, _ := strconv.Atoi(data.Annee)
		semNum, _ := strconv.Atoi(semNumStr)

		data.Promotion = calculatePromoDecal(annee, semNum)

	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
