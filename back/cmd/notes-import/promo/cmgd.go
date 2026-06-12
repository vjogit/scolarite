package promo

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

func ParseCMGD(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "FIG",  // Par défaut on essaie de raccrocher à FIG
		Option:       "CMGD", // Valeur par défaut
	}

	// 1. Regex Standard : "S7-MIEE-RMCE-2006"
	// ^       : Début de ligne
	// S(\d+)  : S7
	// -       : Séparateur
	// (.*?)   : L'option (ex: "IMM" ou "MIEE-RMCE"). "Non-gourmand" pour s'arrêter au dernier tiret.
	// -       : Dernier séparateur
	// (\d{4}) : Année (2006)
	// $       : Fin de ligne (Important pour ancrer l'année)
	reStd := regexp.MustCompile(`^S(\d+)-(.*?)-(\d{4})$`)

	// 2. Regex Mastère : "MASTERE 2EM 2025-2026"
	reMastere := regexp.MustCompile(`^MASTERE\s+(.+)\s+(\d{4})-\d{4}`)

	// 3. Regex Formation Spécialisée : "FORMATION SPECIALISEE 2016-2017" ou "FORMATION SPECIALISEE ESERM 2014-2015"
	reFormSpe := regexp.MustCompile(`^FORMATION SPECIALISEE\s+(?:(.*?)\s+)?(\d{4})-\d{4}`)

	if match := reStd.FindStringSubmatch(nom); match != nil {
		// --- CAS CLASSIQUE (ex: S7-MIEE-RMCE-2006) ---
		data.EstValide = true

		semNumStr := match[1] // "7"
		data.Semestre = "S" + semNumStr
		data.Option = match[2] // "MIEE-RMCE" ou "IMM"
		data.Annee = match[3]  // "2006"

		// Calcul de la Promo FIG (Même logique que EERIE)
		annee, _ := strconv.Atoi(data.Annee)
		semNum, _ := strconv.Atoi(semNumStr)

		data.Promotion = calculatePromoDecal(annee, semNum)

	} else if match := reMastere.FindStringSubmatch(nom); match != nil {
		// --- CAS MASTERE (ex: MASTERE 2EM 2025...) ---
		data.EstValide = true
		data.Option = match[1] // "2EM"
		data.Annee = match[2]  // "2025" (Année de début)
		data.Formation = "Mastère"
		data.Semestre = match[2]
		// Pas de calcul de promo FIG ici car c'est un cycle différent,
		// ou alors on met juste l'année si besoin.
		data.Promotion = fmt.Sprintf("MAS-%s", data.Annee)

	} else if match := reFormSpe.FindStringSubmatch(nom); match != nil {
		// --- CAS FORMATION SPECIALISEE ---
		data.EstValide = true
		opt := strings.TrimSpace(match[1])
		if opt != "" {
			data.Option = opt
		} else {
			data.Option = "ESERM"
		}
		data.Annee = match[2]
		data.Formation = "Divers"
		data.Semestre = match[2]
		data.Promotion = "Formation Spé."

	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
