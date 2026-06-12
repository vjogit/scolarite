package promo

import (
	"fmt"
	"regexp"
	"strconv"
)

func ParseINFRES(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "INFRES",
		Option:       "commun",
	}

	// Regex pour le format : "INFRES 2011_S5"
	// Capture : 1=Année, 2=Semestre
	reStd := regexp.MustCompile(`^INFRES\s+(\d{4})_S(\d+)$`)

	// Regex pour le format avec option : "INFRES 2016_S7_ED", "INFRES 2012_S9 ED" ou "INFRES 2013_S9ED"
	// Capture : 1=Année, 2=Semestre, 3=Option (SR ou ED)
	reOpt := regexp.MustCompile(`^INFRES\s+(\d{4})_S(\d+)[_\s]?(SR|ED)$`)

	// Regex pour le format TOEIC : "INFRES_11_TOEIC"
	// Capture : 1=Année (2 digits)
	reToeic := regexp.MustCompile(`^INFRES[_\s]+(\d+)[_\s]+TOEIC$`)

	// Regex pour le format complet : "INFRES11_2021_S7"
	// Capture : 1=Promo, 2=Année, 3=Semestre
	reFull := regexp.MustCompile(`^INFRES(\d+)_(\d{4})_S(\d+)$`)

	// Regex pour les groupes : "INFRES 2016_S5_GROUPE1"
	// Capture : 1=Année, 2=Semestre, 3=Option (GROUPE1, HARM_INFO, G1, etc.)
	reGroup := regexp.MustCompile(`^INFRES\s+(\d{4})_S(\d+)_(GROUPE1|HARM_INFO|G1|GROUPE2|G2|HARM_RSX)$`)

	if match := reStd.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Annee = match[1]
		data.Semestre = "S" + match[2]

		annee, _ := strconv.Atoi(match[1])
		if annee > 2000 {
			data.Promotion = fmt.Sprintf("INFRES-%02d", annee-2010)
		} else {
			data.Promotion = fmt.Sprintf("INFRES-%s", match[1])
		}
	} else if match := reOpt.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Annee = match[1]
		data.Semestre = "S" + match[2]
		data.Option = match[3]

		annee, _ := strconv.Atoi(match[1])
		if annee > 2000 {
			data.Promotion = fmt.Sprintf("INFRES-%02d", annee-2010)
		} else {
			data.Promotion = fmt.Sprintf("INFRES-%s", match[1])
		}
	} else if match := reToeic.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Annee = "?"
		data.Semestre = "annee"
		data.Option = "TOEIC"

		val, _ := strconv.Atoi(match[1])
		if val > 2000 {
			data.Promotion = fmt.Sprintf("INFRES-%02d", val-2010)
		} else {
			data.Promotion = fmt.Sprintf("INFRES-%02d", val)
		}
	} else if match := reFull.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		val, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("INFRES-%02d", val)
		data.Annee = match[2]
		data.Semestre = "S" + match[3]
	} else if match := reGroup.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		data.Annee = match[1]
		data.Semestre = "S" + match[2]

		option := match[3]
		switch option {
		case "GROUPE1", "HARM_INFO", "G1":
			data.Option = "G1"
		case "GROUPE2", "HARM_RSX", "G2":
			data.Option = "G2"
		}

		annee, _ := strconv.Atoi(match[1])
		if annee > 2000 {
			data.Promotion = fmt.Sprintf("INFRES-%02d", annee-2010)
		}
	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
