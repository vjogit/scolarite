package promo

import (
	"regexp"
	"strconv"
)

func ParseGraduateSchool(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "FIG",
		Option:       "commun", // Valeur par défaut
	}

	// 1. Regex Hors Ecole : "S9-HORS ECOLE-2016" ou "S09-HORS ECOLE 2006 "
	reHorsEcole := regexp.MustCompile(`^S(\d+)-HORS ECOLE[\s-]+(\d{4})\s*$`)

	// 2. Regex avec Option : "S10-GSI-2008"
	// Capture : Semestre, Option, Année
	reWithOption := regexp.MustCompile(`^S(\d+)-(.*?)-(\d{4})$`)

	// 3. Regex sans Option : "S10-2016"
	// Capture : Semestre, Année
	reNoOption := regexp.MustCompile(`^S(\d+)-(\d{4})$`)

	if match := reHorsEcole.FindStringSubmatch(nom); match != nil {
		// --- CAS HORS ECOLE ---
		data.EstValide = true
		data.Semestre = "S" + match[1]
		data.Option = "Hors ecole"
		data.Annee = match[2]

		annee, _ := strconv.Atoi(data.Annee)
		semNum, _ := strconv.Atoi(match[1])
		data.Promotion = calculatePromoDecal(annee, semNum)

	} else if match := reWithOption.FindStringSubmatch(nom); match != nil {
		// --- CAS AVEC OPTION (ex: GSI) ---
		data.EstValide = true
		data.Semestre = "S" + match[1]
		data.Option = match[2]
		data.Annee = match[3]

		annee, _ := strconv.Atoi(data.Annee)
		semNum, _ := strconv.Atoi(match[1])
		data.Promotion = calculatePromoDecal(annee, semNum)

	} else if match := reNoOption.FindStringSubmatch(nom); match != nil {
		// --- CAS SANS OPTION (ex: S10-2016) ---
		data.EstValide = true
		data.Semestre = "S" + match[1]
		data.Option = "commun"
		data.Annee = match[2]

		annee, _ := strconv.Atoi(data.Annee)
		semNum, _ := strconv.Atoi(match[1])
		data.Promotion = calculatePromoDecal(annee, semNum)

	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
