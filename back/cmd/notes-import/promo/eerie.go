package promo

import (
	"regexp"
	"strconv"
)

func ParseEERIE(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "FIG",   // <--- CORRECTION : Formation FIG par défaut
		Option:       "EERIE", // Valeur temporaire
	}

	// 1. Regex CORRIGÉE : ([A-Z0-9]+) accepte les lettres ET les chiffres
	// Capture : 1=Semestre, 2=Option (ex: EMACS ou 2IA), 3=Année
	reStd := regexp.MustCompile(`S(\d+)-([A-Z0-9]+)-(\d{4})`)

	// 2. Regex pour les cas spéciaux (I-E-1 ...)
	reSpecial := regexp.MustCompile(`I-E-(\d)\s+(\d{4})`)

	if match := reStd.FindStringSubmatch(nom); match != nil {
		// --- CAS STANDARD (ex: S9-2IA-2019) ---
		data.EstValide = true

		semNumStr := match[1] // ex: "9"
		data.Semestre = "S" + semNumStr
		data.Option = match[2] // ex: "2IA" ou "EMACS"
		data.Annee = match[3]

		// Calcul de la Promo FIG
		annee, _ := strconv.Atoi(data.Annee)
		semNum, _ := strconv.Atoi(semNumStr)

		data.Promotion = calculatePromoDecal(annee, semNum)

	} else if match := reSpecial.FindStringSubmatch(nom); match != nil {
		// --- CAS SPÉCIAUX (ex: I-E-1 2006-2007) ---
		data.EstValide = true
		level := match[1]

		data.Annee = match[2]
		// Option reste "EERIE" ou peut être vide selon votre besoin

		// Logique rétro-active : I-E-1 correspond à l'année du S7
		data.Semestre = "S7"
		data.Formation = "Divers"
		data.Promotion = "EERIE"
		data.Option = "commun"
		if level == "2" {
			data.Semestre = "S8"
		}

	} else {
		// Si le format ne matche rien, on signale l'erreur
		data.Option = "ERREUR FORMAT"
	}

	return data
}
