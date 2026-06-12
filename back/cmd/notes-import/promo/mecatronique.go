package promo

import (
	"fmt"
	"regexp"
	"strconv"
)

func ParseMECATRONIQUE(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "MKX",
		Option:       "commun",
	}

	// Regex pour le format : "MKX02-M-S5-2016"
	// Capture : 1=Promo (ex: 02), 2=Semestre (ex: 5), 3=Année (ex: 2016)
	reStd := regexp.MustCompile(`^MKX(\d+)-M-\s*S(\d+)-(\d{4})-?$`)

	// Regex pour le format : "MECATRONIQUE-11-2025:2028"
	// Capture : 1=Promo, 2=StartYear
	reRange := regexp.MustCompile(`^MECATRONIQUE-(\d+)-(\d{4}):\d{4}$`)

	// Regex pour le format : "MECATRONIQUE-10 2024/2027"
	// Capture : 1=Promo, 2=StartYear
	reRangeSpace := regexp.MustCompile(`^MECATRONIQUE-(\d+)\s+(\d{4})/\d{4}$`)

	// Regex pour le format sans année : "MKX11-M-S5"
	// Capture : 1=Promo, 2=Semestre
	reNoYear := regexp.MustCompile(`^MKX(\d+)-M-\s*S(\d+)$`)

	if match := reStd.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("MKX-%02d", num)
		data.Semestre = "S" + match[2]
		data.Annee = match[3]
	} else if match := reRange.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("MKX-%02d", num)
		data.Semestre = "annee"
		data.Annee = match[2]
	} else if match := reRangeSpace.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("MKX-%02d", num)
		data.Semestre = "annee"
		data.Annee = match[2]
	} else if match := reNoYear.FindStringSubmatch(nom); match != nil {
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("MKX-%02d", num)
		data.Semestre = "S" + match[2]
		data.Annee = "?"
	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
