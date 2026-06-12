package exercice

import (
	"regexp"
	"strings"
)

// ---------------------------------------------------------------------------
// STRATÉGIE 1 : Simple (Pour les niveaux sans logique complexe)
// ---------------------------------------------------------------------------
func StrategySimple(nomControle string, existingUEs map[string]*Ue) string {
	// Ici on pourrait juste nettoyer le nom ou le renvoyer tel quel
	// Ex: on renvoie le nom du contrôle, ce qui créera une UE portant ce nom exact
	return "(inconnu)"
}

// ---------------------------------------------------------------------------
// STRATÉGIE 2 : Infres
// ---------------------------------------------------------------------------
func StrategyPatternINFRES(nomControle string, existingUEs map[string]*Ue) string {
	// Compilation unique (idéalement à sortir en variable globale si très sollicité)
	nomControle = strings.TrimSpace(nomControle)
	rePattern := regexp.MustCompile(`^(\d+\.\d+)`)

	matches := rePattern.FindStringSubmatch(nomControle)
	if len(matches) > 1 {
		prefix := matches[1] // ex: "1.2"

		// 1. Chercher si une UE existante commence par ce préfixe
		for existingName := range existingUEs {
			if strings.HasPrefix(existingName, prefix) {
				return existingName // On rattache à l'UE existante (ex: "1.2 Mathématiques")
			}
		}
		// 2. Sinon, on retourne le préfixe comme nom d'UE (ex: "1.2")
		return prefix
	}

	// 3. Fallback : Si pas de pattern, on renvoie le nom tel quel
	return "(inconnu)"
}

// ---------------------------------------------------------------------------
// STRATÉGIE 3 : CMGD
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
func StrategyPatternCMGD(nomControle string, existingUEs map[string]*Ue) string {
	nomControle = strings.TrimSpace(nomControle)

	// Nettoyage spécifique : supprimer "TC" ou "MODULE" au début (ex: "TC 8.1 - ...", "MODULE 8.2 - ...")
	reTC := regexp.MustCompile(`^(TC|MODULE)[\s-:]+`)
	nomControle = reTC.ReplaceAllString(nomControle, "")

	// Normalisation : remplacer "X-Y" par "X.Y" (ex: "9-1" -> "9.1")
	reHyphenDot := regexp.MustCompile(`(\d+)-(\d+)`)
	nomControle = reHyphenDot.ReplaceAllString(nomControle, "${1}.${2}")

	// Regex pour extraire le numéro hiérarchique complet d'un contrôle
	// Ex: "ISERM - 10.2.1 : ..." -> capture "10.2.1"
	// Ex: "ISERM - 9.6.3P : ..." -> capture "9.6.3" et "P"
	// Ex: "2EM : 1.1 : ..." -> capture "1.1" (le point final n'est pas capturé par la regex)
	// Ex: "ISERM 9.6.3P" -> capture "9.6.3" et "P" (espace ou rien comme séparateur)
	reCtrl := regexp.MustCompile(`^(ME|EEM|2EM|ISERM|RMCE|MKX|IMC|GC|ESERM|M|MA|MK|GCBE|GITN|SYM|PRISM-SYM|PRISM-GITN|ECOMAP|SITN|BE)[\s-:]*(\d+(?:[\.]\d+)*)([\.\s]*[A-Z]+)?`)
	matches := reCtrl.FindStringSubmatch(nomControle)

	if len(matches) > 3 {
		prefixType := matches[1]                     // ex: "EEM", "2EM", "ISERM"
		numberPart := matches[2]                     // ex: "10.2.1"
		suffix := strings.TrimLeft(matches[3], ". ") // ex: "P" ou "A" ou ""

		// Cas particulier : numéro 0.0 -> UE sans numéro (ex: "ISERM - 0.0 : PROFILS METIERS" -> "ISERM - PROFILS METIERS")
		if numberPart == "0.0" {
			matchesIdx := reCtrl.FindStringSubmatchIndex(nomControle)
			if len(matchesIdx) >= 2 {
				endOfMatch := matchesIdx[1]
				if endOfMatch < len(nomControle) {
					rest := nomControle[endOfMatch:]
					// Nettoyage des séparateurs au début du titre (ex: " : PROFILS..." -> "PROFILS...")
					rest = strings.TrimLeft(rest, " -:")

					candidates := []string{
						prefixType + " - " + rest,
						prefixType + " : " + rest,
						prefixType + " " + rest,
					}
					for _, cand := range candidates {
						if _, ok := existingUEs[cand]; ok {
							return cand
						}
					}
					return prefixType + " - " + rest
				}
			}
		}

		// On va essayer de matcher du plus spécifique au plus général
		// "10.2.1" -> "10.2" -> "10"
		// "9.6.3P" -> "9.6P" -> "9P"
		parts := strings.Split(numberPart, ".")

		for i := len(parts); i > 0; i-- {
			baseNum := strings.Join(parts[:i], ".")
			// On teste d'abord avec le suffixe collé (ex: "9.4P")
			candidates := []string{baseNum + suffix}
			if suffix != "" {
				// Puis avec séparateur (ex: "9.4.P", "9.4 P")
				candidates = append(candidates, baseNum+"."+suffix)
				candidates = append(candidates, baseNum+" "+suffix)
				// Enfin sans suffixe (ex: "9.4")
				candidates = append(candidates, baseNum)
			}

			// Liste des types candidats (ex: "GITN" -> "GITN", "PRISM-GITN")
			typeCandidates := []string{prefixType}
			if !strings.HasPrefix(prefixType, "PRISM") {
				typeCandidates = append(typeCandidates, "PRISM-"+prefixType)
			}
			// Cas spécifique demandé : SYM peut être rattaché à PRISM-GITN
			if prefixType == "SYM" {
				typeCandidates = append(typeCandidates, "PRISM-GITN")
			}

			for _, currentNum := range candidates {
				for _, currentType := range typeCandidates {
					// Construction du pattern de recherche pour l'UE
					ueSearchPattern := regexp.MustCompile(`^` + regexp.QuoteMeta(currentType) + `[\s-:]*` + regexp.QuoteMeta(currentNum) + `\.?(?:[^a-zA-Z0-9\.]|$)`)
					// Pattern pour les UEs regroupées
					ueCombinedPattern := regexp.MustCompile(`^` + regexp.QuoteMeta(currentType) + `[\s-:]*.*(?:[^a-zA-Z0-9\.]|^)` + regexp.QuoteMeta(currentNum) + `\.?(?:[^a-zA-Z0-9\.]|$)`)

					for ueName := range existingUEs {
						if ueSearchPattern.MatchString(ueName) {
							return ueName // Trouvé
						}
						if ueCombinedPattern.MatchString(ueName) {
							return ueName // Trouvé dans un groupe
						}
					}
				}

				// Fallback : Recherche de l'UE par le numéro uniquement (sans le préfixe du type)
				// Ex: "GCBE 9.1" -> cherche "9.1 - ..." si "GCBE 9.1" n'existe pas
				ueNoPrefixPattern := regexp.MustCompile(`^` + regexp.QuoteMeta(currentNum) + `\.?(?:[^a-zA-Z0-9\.]|$)`)
				for ueName := range existingUEs {
					if ueNoPrefixPattern.MatchString(ueName) {
						return ueName
					}
				}
			}
		}

	}

	// 2. Cas où le contrôle commence par un numéro (ex: "5.1 : MAINTENA")
	// On cherche une UE qui contient ce numéro (ex: "2EM : 5.1")
	reNumStart := regexp.MustCompile(`^(\d+(?:[\.]\d+)*)([\.\s]*[A-Z]+)?`)
	if matchesNum := reNumStart.FindStringSubmatch(nomControle); len(matchesNum) > 2 {
		numberPart := matchesNum[1]                     // ex: "5.1"
		suffix := strings.TrimLeft(matchesNum[2], ". ") // ex: ""

		// Recherche hiérarchique : "5.1.1" -> "5.1" -> "5"
		parts := strings.Split(numberPart, ".")
		for i := len(parts); i > 0; i-- {
			baseNum := strings.Join(parts[:i], ".")
			// On teste d'abord avec le suffixe collé (ex: "8.2A")
			candidates := []string{baseNum + suffix}
			if suffix != "" {
				// Puis avec séparateur (ex: "8.2.A", "8.2 A")
				candidates = append(candidates, baseNum+"."+suffix)
				candidates = append(candidates, baseNum+" "+suffix)
				// Enfin sans suffixe (ex: "8.2")
				candidates = append(candidates, baseNum)
			}

			for _, currentNum := range candidates {
				// On cherche une UE contenant ce numéro précédé d'un séparateur et suivi d'une frontière
				// Regex : (début ou séparateur) + numéro + (point optionnel) + (fin ou séparateur)
				ueSearchPattern := regexp.MustCompile(`(?:^|[\s-:])` + regexp.QuoteMeta(currentNum) + `\.?(?:[^a-zA-Z0-9\.]|$)`)

				for ueName := range existingUEs {
					if ueSearchPattern.MatchString(ueName) {
						return ueName
					}
				}
			}
		}

	}

	return "(inconnu)"
}

// ---------------------------------------------------------------------------
// STRATÉGIE 4 :FCD
// ---------------------------------------------------------------------------
func StrategyPatternFCD(nomControle string, existingUEs map[string]*Ue) string {
	nomControle = strings.TrimSpace(nomControle)
	// Capture "FCD" suivi d'un espace et du numéro (ex: "FCD 7.3")
	rePattern := regexp.MustCompile(`^(FCD\s+\d+\.\d+)`)

	matches := rePattern.FindStringSubmatch(nomControle)
	if len(matches) > 1 {
		prefix := matches[1] // ex: "FCD 7.3"

		// 1. Chercher si une UE existante commence par ce préfixe
		for existingName := range existingUEs {
			if strings.HasPrefix(existingName, prefix) {
				return existingName
			}
		}
		// 2. Sinon, on retourne le préfixe (ex: "FCD 7.3")
		return prefix
	}

	return "(inconnu)"
}

// ---------------------------------------------------------------------------
// STRATÉGIE 5 :  EERIE
// ---------------------------------------------------------------------------
func StrategyPatternEERIE(nomControle string, existingUEs map[string]*Ue) string {
	nomControle = strings.TrimSpace(nomControle)
	// Capture "X.Y" au début d'une chaîne ressemblant à "X.Y.Z ..." ou "X.Y ..."
	reStart := regexp.MustCompile(`^(\d+\.\d+)(?:[\.\s])`)
	// Capture "X.Y" après un prefix (ex: 2IA-9.2)
	rePrefix := regexp.MustCompile(`^[A-Z0-9]+-(\d+\.\d+)`)
	// Capture "X.Y" à la fin d'une chaîne (ex: "...-10.2")
	reEnd := regexp.MustCompile(`[-_\s](\d+\.\d+)$`)

	var prefix string
	if matches := reStart.FindStringSubmatch(nomControle); len(matches) > 1 {
		prefix = matches[1]
	} else if matches := rePrefix.FindStringSubmatch(nomControle); len(matches) > 1 {
		prefix = matches[1]
	} else if matches := reEnd.FindStringSubmatch(nomControle); len(matches) > 1 {
		prefix = matches[1]
	}

	if prefix != "" {
		// 1. Chercher si une UE existante contient ce numéro (ex: "2IA 8.1 ...")
		for existingName := range existingUEs {
			if strings.Contains(existingName, prefix) {
				return existingName
			}
		}
		// 2. Sinon, on retourne le préfixe (ex: "8.1")
		return prefix
	}

	return "(inconnu)"
}

// ---------------------------------------------------------------------------
// STRATÉGIE 6 :  BAT
// ---------------------------------------------------------------------------
func StrategyPatternBAT(nomControle string, existingUEs map[string]*Ue) string {
	// Nettoyage : on supprime les espaces avant/après pour que le regex ^... fonctionne
	nomControle = strings.TrimSpace(nomControle)
	// Regex pour supprimer le préfixe "MODULE " des noms d'UE
	reModule := regexp.MustCompile(`^MODULE\s+`)

	// 0. Priorité absolue : Si le nom du contrôle commence exactement par le nom d'une UE existante
	// On cherche la correspondance la plus longue pour éviter les ambiguïtés (ex: "7.2" vs "7.2-CMC-STR")
	var bestMatch string
	var maxLen int

	for existingName := range existingUEs {
		normalizedName := reModule.ReplaceAllString(existingName, "")
		if strings.HasPrefix(nomControle, normalizedName) {
			if len(normalizedName) > maxLen {
				maxLen = len(normalizedName)
				bestMatch = existingName
			}
		}
	}
	if bestMatch != "" {
		return bestMatch
	}

	// 1. Recherche du pattern "X.Y" au début du nom du contrôle (ex: "8.1 ...")
	reXY := regexp.MustCompile(`^(\d+\.\d+)`)
	if matches := reXY.FindStringSubmatch(nomControle); len(matches) > 1 {
		prefix := matches[1]

		var candidates []string
		for existingName := range existingUEs {
			normalizedName := reModule.ReplaceAllString(existingName, "")
			if strings.HasPrefix(normalizedName, prefix) {
				candidates = append(candidates, existingName)
			}
		}

		if len(candidates) == 0 {
			return prefix
		}

		// Disambiguation : on cherche le candidat qui a le plus de mots en commun avec le contrôle
		bestCandidate := candidates[0]
		maxMatches := -1

		for _, cand := range candidates {
			normalizedCand := reModule.ReplaceAllString(cand, "")
			suffix := strings.TrimPrefix(normalizedCand, prefix)
			words := strings.Fields(suffix)
			count := 0
			for _, w := range words {
				if strings.Contains(nomControle, w) {
					count++
				}
			}
			if count > maxMatches {
				maxMatches = count
				bestCandidate = cand
			}
		}
		return bestCandidate
	}

	// 2. Recherche inversée : Est-ce que le contrôle commence par le nom (suffixe) d'une UE existante ?
	// Ex: UE = "8.1 STR", Contrôle = "STR-MECANIQUE..."
	// On extrait "STR" de l'UE et on regarde si le contrôle commence par ça.
	// Regex pour extraire la partie après "X.Y "
	reUESuffix := regexp.MustCompile(`^\d+\.\d+\s+(.*)$`)

	for existingName := range existingUEs {
		normalizedName := reModule.ReplaceAllString(existingName, "")
		// existingName = "8.1 STR" -> suffix = "STR"
		matches := reUESuffix.FindStringSubmatch(normalizedName)
		if len(matches) > 1 {
			suffix := matches[1]
			if suffix != "" && strings.HasPrefix(nomControle, suffix) {
				return existingName
			}
		}
	}

	// 3. Recherche du pattern "UEXY-" (ex: "UE61-...") qui correspond à l'UE "X.Y"
	// On suppose que X et Y sont des chiffres uniques (ex: 6.1 -> UE61)
	reUEXY := regexp.MustCompile(`^UE(\d)(\d)-`)
	if matches := reUEXY.FindStringSubmatch(nomControle); len(matches) > 2 {
		prefix := matches[1] + "." + matches[2]
		for existingName := range existingUEs {
			normalizedName := reModule.ReplaceAllString(existingName, "")
			if strings.HasPrefix(normalizedName, prefix) {
				return existingName
			}
		}
		return prefix
	}

	return "(inconnu)"
}

// ---------------------------------------------------------------------------
// STRATÉGIE 7 :  MECATRONIQUE
// ---------------------------------------------------------------------------
func StrategyPatternMECATRONIQUE(nomControle string, existingUEs map[string]*Ue) string {
	// Nettoyage pour les espaces en début de chaîne
	nomControle = strings.TrimSpace(nomControle)
	rePattern := regexp.MustCompile(`^(\d+\.\d+)`)

	matches := rePattern.FindStringSubmatch(nomControle)
	if len(matches) > 1 {
		prefix := matches[1] // ex: "1.2"

		// 1. Chercher si une UE existante commence par ce préfixe
		for existingName := range existingUEs {
			if strings.HasPrefix(existingName, prefix) {
				return existingName // On rattache à l'UE existante (ex: "1.2 Mathématiques")
			}
		}
		// 2. Sinon, on retourne le préfixe comme nom d'UE (ex: "1.2")
		return prefix
	}

	// 3. Fallback : Si pas de pattern, on renvoie le nom tel quel
	return "(inconnu)"
}

// ---------------------------------------------------------------------------
// STRATÉGIE 8 : LGEI
// ---------------------------------------------------------------------------
func StrategyPatternLGEI(nomControle string, existingUEs map[string]*Ue) string {
	nomControle = strings.TrimSpace(nomControle)
	// 1. Pattern MSSIE : Capture "MSSIE" suivi d'un espace optionnel et d'un chiffre (ex: "MSSIE 5" ou "MSSIE8")
	reMSSIE := regexp.MustCompile(`MSSIE\s*(\d+)`)
	// 2. Pattern S/M : Capture "S" chiffre "/" "M" chiffre (ex: "S1/M1- ...")
	reSM := regexp.MustCompile(`S\d+/M(\d+)`)

	var number string
	if matches := reMSSIE.FindStringSubmatch(nomControle); len(matches) > 1 {
		number = matches[1]
	} else if matches := reSM.FindStringSubmatch(nomControle); len(matches) > 1 {
		number = matches[1]
	}

	if number != "" {
		targetName := "MODULE " + number

		// 1. Chercher si une UE existante correspond
		for existingName := range existingUEs {
			// Match exact ou préfixe avec séparateur (pour éviter MODULE 5 vs MODULE 50)
			if existingName == targetName || strings.HasPrefix(existingName, targetName+" ") || strings.HasPrefix(existingName, targetName+"-") || strings.HasPrefix(existingName, targetName+":") {
				return existingName
			}
		}
		// 2. Sinon, on retourne le nom construit (ex: "MODULE 5")
		return targetName
	}

	// 3. Pattern "X.Y - ...": le contrôle commence par un numéro, et on cherche une UE qui contient ce numéro.
	// Ex: Contrôle "8.1 - ..." -> UE "I2ER 8.1 - ..."
	// Ex: Contrôle "10.1RISK - ..." -> UE "I2ER-RISK 10.1" (le numéro est collé à du texte)
	// Ex: Contrôle "9.6B RISK - ..." -> UE "RISK 9.6B" (suffixe lettre inclus dans le numéro)
	// Ex: Contrôle "9.1 EE ..." -> UE "EE 9.1" (pas de tiret)
	reNumPrefix := regexp.MustCompile(`^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)(.*)`)
	if matches := reNumPrefix.FindStringSubmatch(nomControle); len(matches) > 1 {
		baseNum := matches[1]  // ex: "9.6"
		attached := matches[2] // ex: "B" ou "RISK"
		rest := matches[3]     // ex: " RISK - ..." ou " EE ..."

		// On construit les candidats de numéro à chercher
		// 1. Le numéro avec le suffixe collé (ex: "9.6B")
		// 2. Le numéro de base (ex: "9.6") - utilisé si le suffixe était en fait du texte (ex: "10.1RISK")
		var numCandidates []string
		if attached != "" {
			numCandidates = append(numCandidates, baseNum+attached)
			// Ajout : tester l'inversion (ex: "RISK 10.3" pour "10.3RISK")
			numCandidates = append(numCandidates, attached+baseNum)
			numCandidates = append(numCandidates, attached+" "+baseNum)
		}
		numCandidates = append(numCandidates, baseNum)

		for _, numStr := range numCandidates {
			// On cherche une UE qui contient ce numéro exact
			// Modification : on accepte tout ce qui n'est pas un chiffre ou un point avant le numéro (ex: "RISK9.2", "UE_9.2")
			ueSearchPattern := regexp.MustCompile(`(?:^|[^0-9\.])` + regexp.QuoteMeta(numStr) + `(?:$|\s|:|-|,)`)

			// 1. On collecte tous les candidats qui matchent ce numéro spécifique
			var candidates []string
			for ueName := range existingUEs {
				if ueSearchPattern.MatchString(ueName) {
					candidates = append(candidates, ueName)
				}
			}

			if len(candidates) > 0 {
				// Préparation du texte pour la désambiguation
				textForDisambiguation := rest
				if numStr == baseNum {
					// Si on est sur le fallback (baseNum), alors 'attached' fait partie du texte
					textForDisambiguation = attached + " " + rest
				}

				// Nettoyage des séparateurs pour éviter de matcher "-" ou ":" comme des mots
				cleaner := strings.NewReplacer("-", " ", ":", " ", "_", " ")
				textForDisambiguation = cleaner.Replace(textForDisambiguation)
				textPart := strings.ToUpper(strings.TrimSpace(textForDisambiguation))

				// 2. On essaie de désambigüer si on a plusieurs candidats
				if len(candidates) > 1 && textPart != "" {
					var bestCandidate string
					maxMatches := -1
					textWords := strings.Fields(textPart)

					for _, cand := range candidates {
						candUpper := strings.ToUpper(cand)
						currentMatches := 0
						for _, word := range textWords {
							if strings.Contains(candUpper, word) {
								currentMatches++
							}
						}
						if currentMatches > maxMatches {
							maxMatches = currentMatches
							bestCandidate = cand
						}
					}
					// Si on a trouvé des candidats plus pertinents, on les utilise
					if maxMatches > 0 {
						return bestCandidate
					}
				}

				// 3. Retourne le premier trouvé
				return candidates[0]
			}
		}
	}

	return "(inconnu)"
}

// ---------------------------------------------------------------------------
// STRATÉGIE 9 : CYCLE D'OUVERTURE
// ---------------------------------------------------------------------------
func StrategyPatternCYCLEDOUVERTURE(nomControle string, existingUEs map[string]*Ue) string {
	nomControle = strings.TrimSpace(nomControle)

	// Regex flexible :
	// 1. ^TC : Le contrôle commence par TC
	// 2. [\s-]* : Espace ou tiret optionnel (ex: "TC " ou "TC-")
	// 3. (\d+) : Premier chiffre (ex: 5)
	// 4. [.\-] : Séparateur (point ou tiret)
	// 5. (\d+) : Deuxième chiffre (ex: 7)
	rePattern := regexp.MustCompile(`^TC[\s-]*(\d+)[.\-](\d+)`)

	matches := rePattern.FindStringSubmatch(nomControle)
	if len(matches) > 2 {
		num1 := matches[1] // ex: "5"
		num2 := matches[2] // ex: "7"

		// On définit les formats "cœur" possibles pour la partie "TC..."
		// Cela couvre les variations de séparateurs (tiret ou espace, point ou tiret)
		corePatterns := []string{
			"TC " + num1 + "-" + num2, // Ex: "TC 5-7" (Ton cas spécifique)
			"TC-" + num1 + "-" + num2, // Ex: "TC-5-7"
			"TC-" + num1 + "." + num2, // Ex: "TC-5.7"
			"TC " + num1 + "." + num2, // Ex: "TC 5.7"
		}

		for _, core := range corePatterns {
			// Pour chaque format de base, on cherche deux variantes dans les UEs existantes :
			// 1. Le nom commence directement par le pattern (ex: "TC-5.7 ...")
			// 2. Le nom commence par "MODULE " suivi du pattern (ex: "MODULE TC 5-7 ...")
			candidates := []string{
				core,             // Recherche directe
				"MODULE " + core, // Recherche avec préfixe MODULE
			}

			for _, searchPattern := range candidates {
				for existingName := range existingUEs {
					if strings.HasPrefix(existingName, searchPattern) {
						// Sécurité de frontière :
						// On vérifie que le match est complet (fin de chaine) ou suivi d'un séparateur.
						// Cela évite que "TC 5-7" matche "TC 5-70"
						if len(existingName) == len(searchPattern) {
							return existingName
						}

						nextChar := existingName[len(searchPattern)]
						// On accepte espace, underscore, tiret, deux-points, slash comme séparateurs
						if strings.ContainsRune(" _-:/", rune(nextChar)) {
							return existingName
						}
					}
				}
			}
		}

	}

	return "(inconnu)"
}
