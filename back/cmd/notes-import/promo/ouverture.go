package promo

import (
	"fmt"
	"regexp"
	"strconv"
)

func ParseOuverture(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "FIG",
		Option:       "commun", // Valeur par défaut
	}

	// 1. Regex Hors Ecole : "S5-HORS ECOLE-2025"
	reHorsEcole := regexp.MustCompile(`^S(\d+)-HORS ECOLE-(\d{4})$`)

	// 2. Regex Promo seule : "PROMO 180"
	rePromo := regexp.MustCompile(`^PROMO\s+(\d+)$`)

	// 3. Regex Standard : "S3-2006"
	reStd := regexp.MustCompile(`^\s*S(\d+)-(\d{4})$`)

	if match := reHorsEcole.FindStringSubmatch(nom); match != nil {
		// --- CAS HORS ECOLE ---
		data.EstValide = true
		data.Semestre = "S" + match[1]
		data.Option = "Hors ecole"
		data.Annee = match[2]

		// Calcul Promo
		annee, _ := strconv.Atoi(data.Annee)
		semNum, _ := strconv.Atoi(match[1])
		data.Promotion = calculatePromoDecal(annee, semNum)

	} else if match := rePromo.FindStringSubmatch(nom); match != nil {
		// --- CAS PROMO DIRECTE ---
		data.EstValide = true
		data.Promotion = fmt.Sprintf("FIG-%s", match[1])
		// On ne peut pas deviner l'année ou le semestre avec juste le numéro de promo
		data.Semestre = "?"
		data.Annee = "?"

	} else if match := reStd.FindStringSubmatch(nom); match != nil {
		// --- CAS STANDARD (ex: S3-2006) ---
		data.EstValide = true
		data.Semestre = "S" + match[1]
		data.Annee = match[2]
		// Option reste "commun"

		// Calcul Promo
		annee, _ := strconv.Atoi(data.Annee)
		semNum, _ := strconv.Atoi(match[1])
		data.Promotion = calculatePromoDecal(annee, semNum)

	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
