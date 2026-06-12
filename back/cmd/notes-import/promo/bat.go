package promo

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

func ParseBAT(nom string) ParsedData {
	data := ParsedData{
		OriginalName: nom,
		EstValide:    false,
		Formation:    "BAT",
		Option:       "commun", // Valeur par défaut
	}

	// 1. Regex pour le format court : "01-CMC"
	// Capture : Promo (ex: 01)
	reShort := regexp.MustCompile(`^(\d+)-CMC$`)

	// 2. Regex pour le format complet : "01-S5-CMC-2008", "03-S9-CMC-OPT ENER-2012" ou "10-S7 CMC 2018"
	// Capture : 1=Promo, 2=Semestre, 3=Option (partie centrale), 4=Année
	reFull := regexp.MustCompile(`^(\d+)-S(\d+)[-\s]+(.*?)[-\s]+(\d{4})(?:/\d{4})?$`)

	// 3. Regex pour le format "BAT-17-S10"
	// Capture : 1=Promo, 2=Semestre
	reBat := regexp.MustCompile(`^BAT-(\d+)-S(\d+)$`)

	// 4. Regex pour le format "BAT 18 2025-202..."
	// Capture : 1=Promo, 2=Année
	reBatYear := regexp.MustCompile(`^BAT\s+(\d+)\s+(\d{4})`)

	// 5. Regex pour le format "BAT 17"
	// Capture : 1=Promo
	reBatSimple := regexp.MustCompile(`^BAT\s+(\d+)$`)

	// 6. Regex pour le format sans année : "05-S9-CMC-OPT STRUCT"
	// Capture : 1=Promo, 2=Semestre, 3=Option
	reNoYear := regexp.MustCompile(`^(\d+)-S(\d+)-(.*)$`)

	// 7. Regex pour le format "04-S7CMC-2012" ou "02-S10CMC-OPT ENER-2012" (Option collée au semestre)
	// Capture : 1=Promo, 2=Semestre, 3=Option (commençant par CMC), 4=Année
	reAttached := regexp.MustCompile(`^(\d+)-S(\d+)(CMC.*?)[\s-]+(\d{4})(?:/\d{4})?$`)

	// 8. Regex pour le format "02-S10CMC2012" (Tout collé sans tiret avant l'année)
	// Capture : 1=Promo, 2=Semestre, 3=Option (CMC), 4=Année
	reAttachedNoHyphen := regexp.MustCompile(`^(\d+)-S(\d+)(CMC)(\d{4})$`)

	// 9. Regex pour le format "BAT-CMC 13-S7"
	// Capture : 1=Promo, 2=Semestre
	reBatCmc := regexp.MustCompile(`^BAT-CMC\s+(\d+)-S(\d+)$`)

	// 10. Regex pour le format TOEIC : "CMC 11 TOEIC", "BAT 14 TOEIC" ou "CMC7 TOEIC"
	// Capture : 1=Prefixe, 2=Promo
	reToeic := regexp.MustCompile(`^(CMC|BAT)\s*(\d+)\s+TOEIC$`)

	// 11. Regex pour le format "CMC 12"
	// Capture : 1=Promo
	reCmcSimple := regexp.MustCompile(`^CMC\s+(\d+)$`)

	// 12. Regex pour le format "BAT-CMC 13"
	// Capture : 1=Promo
	reBatCmcSimple := regexp.MustCompile(`^BAT-CMC\s+(\d+)$`)

	if match := reShort.FindStringSubmatch(nom); match != nil {
		// --- CAS COURT (ex: 01-CMC) ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("CMC-%02d", num)
		data.Option = "commun"
		// Pas d'info de semestre ou d'année précise dans ce format
		data.Semestre = "?"
		data.Annee = "?"

	} else if match := reFull.FindStringSubmatch(nom); match != nil {
		// --- CAS COMPLET (ex: 01-S5-CMC-2008) ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("CMC-%02d", num)
		data.Semestre = "S" + match[2]
		if strings.Contains(match[3], "OPT") {
			data.Option = match[3]
		} else {
			data.Option = "commun"
		}
		data.Annee = match[4]
	} else if match := reNoYear.FindStringSubmatch(nom); match != nil {
		// --- CAS SANS ANNEE (ex: 05-S9-CMC-OPT STRUCT) ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("CMC-%02d", num)
		data.Semestre = "S" + match[2]
		if strings.Contains(match[3], "OPT") {
			data.Option = match[3]
		} else {
			data.Option = "commun"
		}
		data.Annee = "?"
	} else if match := reBat.FindStringSubmatch(nom); match != nil {
		// --- CAS BAT-17-S10 ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("BAT-%02d", num)
		data.Semestre = "S" + match[2]
		data.Option = "commun"
		data.Annee = "?"
	} else if match := reBatYear.FindStringSubmatch(nom); match != nil {
		// --- CAS BAT 18 2025... ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("BAT-%02d", num)
		data.Semestre = "?"
		data.Option = "commun"
		data.Annee = match[2]
	} else if match := reAttached.FindStringSubmatch(nom); match != nil {
		// --- CAS ATTACHED (ex: 04-S7CMC-2012) ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("CMC-%02d", num)
		data.Semestre = "S" + match[2]
		if strings.Contains(match[3], "OPT") {
			data.Option = match[3]
		} else {
			data.Option = "commun"
		}
		data.Annee = match[4]
	} else if match := reAttachedNoHyphen.FindStringSubmatch(nom); match != nil {
		// --- CAS ATTACHED NO HYPHEN (ex: 02-S10CMC2012) ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("CMC-%02d", num)
		data.Semestre = "S" + match[2]
		if strings.Contains(match[3], "OPT") {
			data.Option = match[3]
		} else {
			data.Option = "commun"
		}
		data.Annee = match[4]
	} else if match := reBatCmc.FindStringSubmatch(nom); match != nil {
		// --- CAS BAT-CMC 13-S7 ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("CMC-%02d", num)
		data.Semestre = "S" + match[2]
		data.Option = "commun"
		data.Annee = "?"
	} else if match := reToeic.FindStringSubmatch(nom); match != nil {
		// --- CAS TOEIC (ex: CMC 11 TOEIC) ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[2])
		data.Promotion = fmt.Sprintf("%s-%02d", match[1], num)
		data.Semestre = "annee"
		data.Option = "TOEIC"
		data.Annee = "?"
	} else if match := reCmcSimple.FindStringSubmatch(nom); match != nil {
		// --- CAS CMC 12 ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("CMC-%02d", num)
		data.Semestre = "?"
		data.Option = "commun"
		data.Annee = "?"
	} else if match := reBatCmcSimple.FindStringSubmatch(nom); match != nil {
		// --- CAS BAT-CMC 13 ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("CMC-%02d", num)
		data.Semestre = "?"
		data.Option = "commun"
		data.Annee = "?"
	} else if match := reBatSimple.FindStringSubmatch(nom); match != nil {
		// --- CAS BAT 17 ---
		data.EstValide = true
		num, _ := strconv.Atoi(match[1])
		data.Promotion = fmt.Sprintf("BAT-%02d", num)
		data.Semestre = "?"
		data.Option = "commun"
		data.Annee = "?"
	} else {
		data.Formation = "Format Inconnu"
	}

	return data
}
