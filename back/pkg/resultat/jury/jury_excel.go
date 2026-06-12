package jury

import (
	"fmt"
	"log"

	"github.com/xuri/excelize/v2"
)

// Déclaration des valeurs possibles de l'Enum
const (
	StyleCentrer                  ExcelStyle = "centrer"
	StyleBordureEpaisse           ExcelStyle = "bordure_epaisse"
	StyleTitreJaune               ExcelStyle = "titre_jaune"
	StyleEnteteUE                 ExcelStyle = "entete_ue"
	StyleBordureEpaisseCenter     ExcelStyle = "bordure_epaisse_center"
	StyleBordureEpaisseCenterGris ExcelStyle = "bordure_epaisse_center_gris"
	// Styles pour les cellules UE : bordure épaisse uniquement sur les bords extérieurs du bloc
	StyleUeGauche      ExcelStyle = "ue_gauche"
	StyleUeMilieu      ExcelStyle = "ue_milieu"
	StyleUeDroite      ExcelStyle = "ue_droite"
	StyleUeGaucheGris  ExcelStyle = "ue_gauche_gris"
	StyleUeMilieuGris  ExcelStyle = "ue_milieu_gris"
	StyleUeDroiteGris  ExcelStyle = "ue_droite_gris"
	StyleUeGaucheJaune ExcelStyle = "ue_gauche_jaune"
	StyleUeMilieuJaune ExcelStyle = "ue_milieu_jaune"
	StyleUeDroiteJaune ExcelStyle = "ue_droite_jaune"
	StyleUeGaucheBleu              ExcelStyle = "ue_gauche_bleu"
	StyleUeMilieuBleu              ExcelStyle = "ue_milieu_bleu"
	StyleUeDroiteBleu              ExcelStyle = "ue_droite_bleu"
	StyleBordureEpaisseCenterBleu  ExcelStyle = "bordure_epaisse_center_bleu"
	StyleBordureEpaisseCenterJaune ExcelStyle = "bordure_epaisse_center_jaune"
)

// Constantes pour les indices de colonnes et lignes
const (
	periodeRow      = 3
	nomPrenomRow    = 4
	ueNomRow        = 4
	ueECTSRow       = 5
	startColIndex   = 3 // Colonne C
	nomCol          = "A"
	prenomCol       = "B"
	periodeStartCol = "C"
)

// GenerateJuryExcel crée le fichier Excel à partir des données préparées du jury.
func (s *JuryService) GenerateJuryExcel(f *excelize.File, data *JuryData) error {
	s.initStyles(f)
	sheetName := "Sheet1"
	s.createEntete(f, sheetName, data.Hierarchy)
	s.writeAllElevesNotes(f, sheetName, data)
	s.writeTableauRattrapages(f, sheetName, data)
	s.writeTableauRemplacements(f, sheetName, data)

	return nil
}

// initStyles initialise les styles Excel
func (s *JuryService) initStyles(f *excelize.File) error {
	s.styles = make(map[ExcelStyle]int)
	var err error

	// Style centré
	s.styles[StyleCentrer], err = s.createStyle(f, &excelize.Style{
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	if err != nil {
		return fmt.Errorf("Erreur lors de la création du style centré: %v\n", err)
	}

	// Style bordure épaisse
	s.styles[StyleBordureEpaisse], err = s.createStyle(f, &excelize.Style{
		Border: []excelize.Border{
			{Type: "left", Color: "000000", Style: 5},
			{Type: "top", Color: "000000", Style: 5},
			{Type: "bottom", Color: "000000", Style: 5},
			{Type: "right", Color: "000000", Style: 5},
		},
	})
	if err != nil {
		return fmt.Errorf("Erreur lors de la création du style bordure épaisse: %v\n", err)
	}

	// Style bordure épaisse centré
	s.styles[StyleBordureEpaisseCenter], err = s.createStyle(f, &excelize.Style{
		Border: []excelize.Border{
			{Type: "left", Color: "000000", Style: 5},
			{Type: "top", Color: "000000", Style: 5},
			{Type: "bottom", Color: "000000", Style: 5},
			{Type: "right", Color: "000000", Style: 5},
		},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
	})
	if err != nil {
		return fmt.Errorf("Erreur lors de la création du style bordure épaisse center: %v\n", err)
	}

	// Style titre jaune
	s.styles[StyleTitreJaune], err = s.createStyle(f, &excelize.Style{
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#FFFF00"}, Pattern: 1},
		Font:      &excelize.Font{Bold: true},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	if err != nil {
		return fmt.Errorf("Erreur lors de la création du style StyleTitreJaune: %v\n", err)
	}

	// Style bordure épaisse centré gris (lignes paires)
	s.styles[StyleBordureEpaisseCenterGris], err = s.createStyle(f, &excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#D9D9D9"}, Pattern: 1},
		Border: []excelize.Border{
			{Type: "left", Color: "000000", Style: 5},
			{Type: "top", Color: "000000", Style: 5},
			{Type: "bottom", Color: "000000", Style: 5},
			{Type: "right", Color: "000000", Style: 5},
		},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
	})
	if err != nil {
		return fmt.Errorf("Erreur lors de la création du style StyleBordureEpaisseCenterGris: %v\n", err)
	}

	// Style bordure épaisse centré bleu (N.E. - UE unique)
	s.styles[StyleBordureEpaisseCenterBleu], err = s.createStyle(f, &excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#ADD8E6"}, Pattern: 1},
		Border: []excelize.Border{
			{Type: "left", Color: "000000", Style: 5},
			{Type: "top", Color: "000000", Style: 5},
			{Type: "bottom", Color: "000000", Style: 5},
			{Type: "right", Color: "000000", Style: 5},
		},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
	})
	if err != nil {
		return fmt.Errorf("Erreur lors de la création du style StyleBordureEpaisseCenterBleu: %v\n", err)
	}

	// Style bordure épaisse centré jaune (titre tableau rattrapages)
	s.styles[StyleBordureEpaisseCenterJaune], err = s.createStyle(f, &excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#FFFF00"}, Pattern: 1},
		Border: []excelize.Border{
			{Type: "left", Color: "000000", Style: 5},
			{Type: "top", Color: "000000", Style: 5},
			{Type: "bottom", Color: "000000", Style: 5},
			{Type: "right", Color: "000000", Style: 5},
		},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
	})
	if err != nil {
		return fmt.Errorf("Erreur lors de la création du style StyleBordureEpaisseCenterJaune: %v\n", err)
	}

	// Styles pour les cellules UE : bordure épaisse uniquement sur les bords extérieurs du bloc.
	// 3 positions (gauche, milieu, droite) × 3 couleurs (blanc, gris, jaune F) = 9 styles.
	bordureHaut := excelize.Border{Type: "top", Color: "000000", Style: 5}
	bordureBas := excelize.Border{Type: "bottom", Color: "000000", Style: 5}
	bordureGauche := excelize.Border{Type: "left", Color: "000000", Style: 5}
	bordureDroite := excelize.Border{Type: "right", Color: "000000", Style: 5}
	alignCenter := &excelize.Alignment{Horizontal: "center", Vertical: "center"}
	fillGris := excelize.Fill{Type: "pattern", Color: []string{"#D9D9D9"}, Pattern: 1}
	fillJaune := excelize.Fill{Type: "pattern", Color: []string{"#FFFF00"}, Pattern: 1}
	fillBleu := excelize.Fill{Type: "pattern", Color: []string{"#ADD8E6"}, Pattern: 1}

	ueStyleDefs := []struct {
		key    ExcelStyle
		fill   *excelize.Fill
		gauche bool
		droite bool
	}{
		{StyleUeGauche, nil, true, false},
		{StyleUeMilieu, nil, false, false},
		{StyleUeDroite, nil, false, true},
		{StyleUeGaucheGris, &fillGris, true, false},
		{StyleUeMilieuGris, &fillGris, false, false},
		{StyleUeDroiteGris, &fillGris, false, true},
		{StyleUeGaucheJaune, &fillJaune, true, false},
		{StyleUeMilieuJaune, &fillJaune, false, false},
		{StyleUeDroiteJaune, &fillJaune, false, true},
		{StyleUeGaucheBleu, &fillBleu, true, false},
		{StyleUeMilieuBleu, &fillBleu, false, false},
		{StyleUeDroiteBleu, &fillBleu, false, true},
	}

	for _, def := range ueStyleDefs {
		borders := []excelize.Border{bordureHaut, bordureBas}
		if def.gauche {
			borders = append(borders, bordureGauche)
		}
		if def.droite {
			borders = append(borders, bordureDroite)
		}
		style := &excelize.Style{Border: borders, Alignment: alignCenter}
		if def.fill != nil {
			style.Fill = *def.fill
		}
		s.styles[def.key], err = s.createStyle(f, style)
		if err != nil {
			return fmt.Errorf("erreur création style %s: %v", def.key, err)
		}
	}

	return nil
}

// createEntete crée l'en-tête du fichier Excel
func (s *JuryService) createEntete(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	s.createEntetePeriode(f, sheet, hierarchy)
	s.createNomPrenom(f, sheet)
	s.createEnteteUes(f, sheet, hierarchy)
	s.createEnteteEcts(f, sheet, hierarchy)
	s.createEnteteEctsNonValides(f, sheet, hierarchy)
	s.createEnteteGpaAcademique(f, sheet, hierarchy)
	s.createEnteteGpa(f, sheet, hierarchy)
	s.createEnteteToeic(f, sheet, hierarchy)
	s.createEnteteMobilite(f, sheet, hierarchy)
}

// createStyle crée un style et retourne son index
func (s *JuryService) createStyle(f *excelize.File, style *excelize.Style) (int, error) {
	return f.NewStyle(style)
}

// createEntetePeriode crée l'en-tête de la période
func (s *JuryService) createEntetePeriode(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	nomColPeriodeFin, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) - 1)
	if err != nil {
		log.Fatalf("Erreur lors de la conversion du numéro de colonne: %v\n", err)
	}

	cellPeriode := periodeStartCol + fmt.Sprintf("%d", periodeRow)
	err = s.setMergedCellWithStyle(f, sheet, cellPeriode, fmt.Sprintf("%s%d", nomColPeriodeFin, periodeRow), hierarchy.Periode, s.styles[StyleBordureEpaisseCenter])
	if err != nil {
		log.Fatalf("Erreur lors de la création de l'en-tête de période: %v\n", err)
	}
}

// createNomPrenom crée les colonnes Nom et Prénom
func (s *JuryService) createNomPrenom(f *excelize.File, sheet string) {
	err := s.setMergedCellWithStyle(f, sheet, nomCol+fmt.Sprintf("%d", nomPrenomRow), nomCol+fmt.Sprintf("%d", nomPrenomRow+1), "Nom", s.styles[StyleBordureEpaisseCenter])
	if err != nil {
		log.Fatalf("Erreur lors de la création de la colonne Nom: %v\n", err)
	}

	err = s.setMergedCellWithStyle(f, sheet, prenomCol+fmt.Sprintf("%d", nomPrenomRow), prenomCol+fmt.Sprintf("%d", nomPrenomRow+1), "Prenom", s.styles[StyleBordureEpaisseCenter])
	if err != nil {
		log.Fatalf("Erreur lors de la création de la colonne Prénom: %v\n", err)
	}
}

// createEnteteUes crée l'en-tête des UEs
func (s *JuryService) createEnteteUes(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	for index, ue := range hierarchy.UEs {
		nomCol, err := excelize.ColumnNumberToName(startColIndex + index)
		if err != nil {
			log.Fatalf("Erreur lors de la conversion du numéro de colonne: %v\n", err)
		}

		// Nom de l'UE
		err = s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", nomCol, ueNomRow), ue.Nom, s.styles[StyleBordureEpaisseCenter])
		if err != nil {
			log.Fatalf("Erreur lors de l'écriture du nom de l'UE: %v\n", err)
		}

		// ECTS de l'UE
		err = s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", nomCol, ueECTSRow), ue.ECTS, s.styles[StyleBordureEpaisseCenter])
		if err != nil {
			log.Fatalf("Erreur lors de l'écriture des ECTS de l'UE: %v\n", err)
		}
	}
}

// createEnteteEcts crée l'en-tête de la colonne Total ECTS, juste après les colonnes UE
func (s *JuryService) createEnteteEcts(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	ectsColIndex := startColIndex + len(hierarchy.UEs)
	ectsCol, err := excelize.ColumnNumberToName(ectsColIndex)
	if err != nil {
		log.Fatalf("Erreur lors de la conversion du numéro de colonne ECTS: %v\n", err)
	}

	err = s.setMergedCellWithStyle(f, sheet,
		fmt.Sprintf("%s%d", ectsCol, ueNomRow),
		fmt.Sprintf("%s%d", ectsCol, ueECTSRow),
		"ECTS", s.styles[StyleBordureEpaisseCenter],
	)
	if err != nil {
		log.Fatalf("Erreur lors de la création de l'en-tête ECTS: %v\n", err)
	}
}

// createEnteteEctsNonValides crée l'en-tête de la colonne ECTS non validés, entre ECTS et GPA
func (s *JuryService) createEnteteEctsNonValides(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	col, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 1)
	if err != nil {
		log.Fatalf("Erreur lors de la conversion du numéro de colonne ECTS non validés: %v\n", err)
	}

	err = s.setMergedCellWithStyle(f, sheet,
		fmt.Sprintf("%s%d", col, ueNomRow),
		fmt.Sprintf("%s%d", col, ueECTSRow),
		"ECTS F", s.styles[StyleBordureEpaisseCenter],
	)
	if err != nil {
		log.Fatalf("Erreur lors de la création de l'en-tête ECTS non validés: %v\n", err)
	}
}

// createEnteteGpaAcademique crée l'en-tête de la colonne GPA Académique, juste après ECTS non validés
func (s *JuryService) createEnteteGpaAcademique(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	col, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 2)
	if err != nil {
		log.Fatalf("Erreur lors de la conversion du numéro de colonne GPA Académique: %v\n", err)
	}

	err = s.setMergedCellWithStyle(f, sheet,
		fmt.Sprintf("%s%d", col, ueNomRow),
		fmt.Sprintf("%s%d", col, ueECTSRow),
		"GPA Académique", s.styles[StyleBordureEpaisseCenter],
	)
	if err != nil {
		log.Fatalf("Erreur lors de la création de l'en-tête GPA Académique: %v\n", err)
	}
}

// createEnteteGpa crée l'en-tête de la colonne GPA, juste après la colonne ECTS non validés
func (s *JuryService) createEnteteGpa(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	gpaCol, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 3)
	if err != nil {
		log.Fatalf("Erreur lors de la conversion du numéro de colonne GPA: %v\n", err)
	}

	err = s.setMergedCellWithStyle(f, sheet,
		fmt.Sprintf("%s%d", gpaCol, ueNomRow),
		fmt.Sprintf("%s%d", gpaCol, ueECTSRow),
		"GPA", s.styles[StyleBordureEpaisseCenter],
	)
	if err != nil {
		log.Fatalf("Erreur lors de la création de l'en-tête GPA: %v\n", err)
	}
}

// createEnteteToeic crée l'en-tête de la colonne TOEIC, juste après la colonne GPA
func (s *JuryService) createEnteteToeic(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	col, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 4)
	if err != nil {
		log.Fatalf("Erreur lors de la conversion du numéro de colonne TOEIC: %v\n", err)
	}

	err = s.setMergedCellWithStyle(f, sheet,
		fmt.Sprintf("%s%d", col, ueNomRow),
		fmt.Sprintf("%s%d", col, ueECTSRow),
		"TOEIC", s.styles[StyleBordureEpaisseCenter],
	)
	if err != nil {
		log.Fatalf("Erreur lors de la création de l'en-tête TOEIC: %v\n", err)
	}
}

// createEnteteMobilite crée l'en-tête de la colonne Mobilité, juste après la colonne TOEIC
func (s *JuryService) createEnteteMobilite(f *excelize.File, sheet string, hierarchy *Hierarchie) {
	col, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 5)
	if err != nil {
		log.Fatalf("Erreur lors de la conversion du numéro de colonne Mobilité: %v\n", err)
	}

	err = s.setMergedCellWithStyle(f, sheet,
		fmt.Sprintf("%s%d", col, ueNomRow),
		fmt.Sprintf("%s%d", col, ueECTSRow),
		"Mobilité", s.styles[StyleBordureEpaisseCenter],
	)
	if err != nil {
		log.Fatalf("Erreur lors de la création de l'en-tête Mobilité: %v\n", err)
	}
}

// writeAllElevesNotes écrit les lignes de notes pour tous les étudiants.
func (s *JuryService) writeAllElevesNotes(f *excelize.File, sheet string, data *JuryData) error {
	startRow := ueECTSRow + 1
	for rowIndex, entry := range data.Students {
		currentRow := startRow + rowIndex
		if err := s.writeEleveRow(f, sheet, currentRow, rowIndex, entry.UserID, entry.JuryStat, data.StatsUe, data.Hierarchy); err != nil {
			return err
		}
	}
	return nil
}

// writeEleveRow écrit une ligne complète pour un étudiant (nom, prénom, notes par UE)
// rowIndex est utilisé pour alterner la couleur de fond (1 ligne sur 2 en gris)
func (s *JuryService) writeEleveRow(f *excelize.File, sheet string, row int, rowIndex int, userID int32, juryStat JuryStat, statsUeMap map[int32]map[int32]UeStat, hierarchy *Hierarchie) error {
	gris := rowIndex%2 == 1

	styleIdentite := StyleBordureEpaisseCenter
	if gris {
		styleIdentite = StyleBordureEpaisseCenterGris
	}

	if err := s.writeNomPrenom(f, sheet, row, juryStat, styleIdentite); err != nil {
		return err
	}
	if err := s.writeNotesUes(f, sheet, row, userID, statsUeMap, hierarchy, gris); err != nil {
		return err
	}
	if err := s.writeTotalEcts(f, sheet, row, juryStat, hierarchy, gris); err != nil {
		return err
	}
	if err := s.writeEctsNonValides(f, sheet, row, juryStat, hierarchy, gris); err != nil {
		return err
	}
	if err := s.writeGpaAcademique(f, sheet, row, juryStat, hierarchy, gris); err != nil {
		return err
	}
	if err := s.writeGpa(f, sheet, row, juryStat, hierarchy, gris); err != nil {
		return err
	}
	if err := s.writeToeic(f, sheet, row, juryStat, hierarchy, gris); err != nil {
		return err
	}
	return s.writeMobilite(f, sheet, row, juryStat, hierarchy, gris)
}

// writeNomPrenom écrit le nom et le prénom d'un étudiant dans les colonnes A et B
func (s *JuryService) writeNomPrenom(f *excelize.File, sheet string, row int, juryStat JuryStat, style ExcelStyle) error {
	lastName := ""
	if juryStat.LastName != nil {
		lastName = *juryStat.LastName
	}
	if err := s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", nomCol, row), lastName, s.styles[style]); err != nil {
		return fmt.Errorf("erreur écriture nom étudiant: %v", err)
	}

	firstName := ""
	if juryStat.FirstName != nil {
		firstName = *juryStat.FirstName
	}
	if err := s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", prenomCol, row), firstName, s.styles[style]); err != nil {
		return fmt.Errorf("erreur écriture prénom étudiant: %v", err)
	}

	return nil
}

// writeNotesUes écrit les notes d'un étudiant pour chaque UE de la hiérarchie.
// La bordure épaisse est appliquée uniquement sur les bords extérieurs du bloc (gauche, droite, haut, bas).
func (s *JuryService) writeNotesUes(f *excelize.File, sheet string, row int, userID int32, statsUeMap map[int32]map[int32]UeStat, hierarchy *Hierarchie, gris bool) error {
	lastIndex := len(hierarchy.UEs) - 1

	for index, ue := range hierarchy.UEs {
		var cellValue any = "-"
		estF := false
		estNE := false
		if ueStats, exists := statsUeMap[userID][ue.ID]; exists && ueStats.GradeLettre != nil {
			cellValue = *ueStats.GradeLettre
			estF = *ueStats.GradeLettre == "F"
			estNE = *ueStats.GradeLettre == "N.E."
		}

		// Choix du style selon la position, la couleur de ligne et si le grade est F ou N.E.
		var style ExcelStyle
		switch {
		case index == 0 && index == lastIndex:
			if estF {
				style = StyleTitreJaune
			} else if estNE {
				style = StyleBordureEpaisseCenterBleu
			} else if gris {
				style = StyleBordureEpaisseCenterGris
			} else {
				style = StyleBordureEpaisseCenter
			}
		case index == 0:
			if estF {
				style = StyleUeGaucheJaune
			} else if estNE {
				style = StyleUeGaucheBleu
			} else if gris {
				style = StyleUeGaucheGris
			} else {
				style = StyleUeGauche
			}
		case index == lastIndex:
			if estF {
				style = StyleUeDroiteJaune
			} else if estNE {
				style = StyleUeDroiteBleu
			} else if gris {
				style = StyleUeDroiteGris
			} else {
				style = StyleUeDroite
			}
		default:
			if estF {
				style = StyleUeMilieuJaune
			} else if estNE {
				style = StyleUeMilieuBleu
			} else if gris {
				style = StyleUeMilieuGris
			} else {
				style = StyleUeMilieu
			}
		}

		colName, err := excelize.ColumnNumberToName(startColIndex + index)
		if err != nil {
			return fmt.Errorf("erreur conversion numéro de colonne: %v", err)
		}

		if err := s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", colName, row), cellValue, s.styles[style]); err != nil {
			return fmt.Errorf("erreur écriture note UE %s: %v", ue.Nom, err)
		}
	}

	return nil
}

// writeTotalEcts écrit le total d'ECTS validés pour un étudiant dans la colonne après les UEs
func (s *JuryService) writeTotalEcts(f *excelize.File, sheet string, row int, juryStat JuryStat, hierarchy *Hierarchie, gris bool) error {
	ectsColIndex := startColIndex + len(hierarchy.UEs)
	ectsCol, err := excelize.ColumnNumberToName(ectsColIndex)
	if err != nil {
		return fmt.Errorf("erreur conversion numéro de colonne ECTS: %v", err)
	}

	style := StyleBordureEpaisseCenter
	if gris {
		style = StyleBordureEpaisseCenterGris
	}

	var val any = "-"
	if juryStat.TotalEctsValides != nil {
		val = *juryStat.TotalEctsValides
	}

	return s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", ectsCol, row), val, s.styles[style])
}

// writeEctsNonValides écrit le total d'ECTS non validés (grade F) dans la colonne entre ECTS et GPA
func (s *JuryService) writeEctsNonValides(f *excelize.File, sheet string, row int, juryStat JuryStat, hierarchy *Hierarchie, gris bool) error {
	col, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 1)
	if err != nil {
		return fmt.Errorf("erreur conversion numéro de colonne ECTS non validés: %v", err)
	}

	style := StyleBordureEpaisseCenter
	if gris {
		style = StyleBordureEpaisseCenterGris
	}

	var val any = "-"
	if juryStat.TotalEctsPeriode != nil && juryStat.TotalEctsValides != nil {
		val = *juryStat.TotalEctsPeriode - *juryStat.TotalEctsValides
	}

	return s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", col, row), val, s.styles[style])
}

// writeGpaAcademique écrit le GPA académique d'un étudiant dans la colonne après les ECTS non validés
func (s *JuryService) writeGpaAcademique(f *excelize.File, sheet string, row int, juryStat JuryStat, hierarchy *Hierarchie, gris bool) error {
	col, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 2)
	if err != nil {
		return fmt.Errorf("erreur conversion numéro de colonne GPA Académique: %v", err)
	}

	style := StyleBordureEpaisseCenter
	if gris {
		style = StyleBordureEpaisseCenterGris
	}

	var cellValue any = "-"
	if juryStat.GpaAcademiquePeriode != nil {
		cellValue = fmt.Sprintf("%.2f", *juryStat.GpaAcademiquePeriode)
	}

	return s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", col, row), cellValue, s.styles[style])
}

// writeGpa écrit le GPA d'un étudiant dans la colonne après les ECTS non validés
func (s *JuryService) writeGpa(f *excelize.File, sheet string, row int, juryStat JuryStat, hierarchy *Hierarchie, gris bool) error {
	gpaCol, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 3)
	if err != nil {
		return fmt.Errorf("erreur conversion numéro de colonne GPA: %v", err)
	}

	style := StyleBordureEpaisseCenter
	if gris {
		style = StyleBordureEpaisseCenterGris
	}

	var cellValue any = "-"
	if juryStat.GpaPeriode != nil {
		cellValue = fmt.Sprintf("%.2f", *juryStat.GpaPeriode)
	}

	return s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", gpaCol, row), cellValue, s.styles[style])
}

// writeToeic écrit le score TOEIC d'un étudiant dans la colonne après GPA
func (s *JuryService) writeToeic(f *excelize.File, sheet string, row int, juryStat JuryStat, hierarchy *Hierarchie, gris bool) error {
	col, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 4)
	if err != nil {
		return fmt.Errorf("erreur conversion numéro de colonne TOEIC: %v", err)
	}

	style := StyleBordureEpaisseCenter
	if gris {
		style = StyleBordureEpaisseCenterGris
	}

	var cellValue any = "-"
	if juryStat.TOEIC != nil {
		cellValue = *juryStat.TOEIC
	}

	return s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", col, row), cellValue, s.styles[style])
}

// writeMobilite écrit la validité de la mobilité d'un étudiant dans la colonne après TOEIC
func (s *JuryService) writeMobilite(f *excelize.File, sheet string, row int, juryStat JuryStat, hierarchy *Hierarchie, gris bool) error {
	col, err := excelize.ColumnNumberToName(startColIndex + len(hierarchy.UEs) + 5)
	if err != nil {
		return fmt.Errorf("erreur conversion numéro de colonne Mobilité: %v", err)
	}

	style := StyleBordureEpaisseCenter
	if gris {
		style = StyleBordureEpaisseCenterGris
	}

	var cellValue any = "-"
	if juryStat.MobiliteValide != nil {
		if *juryStat.MobiliteValide {
			cellValue = "Oui"
		} else {
			cellValue = "Non"
		}
	}

	return s.setCellWithStyle(f, sheet, fmt.Sprintf("%s%d", col, row), cellValue, s.styles[style])
}

// setMergedCellWithStyle fusionne des cellules et applique un style
func (s *JuryService) setMergedCellWithStyle(f *excelize.File, sheet, start, end, value string, styleID int) error {
	if err := f.SetCellValue(sheet, start, value); err != nil {
		return err
	}
	if err := f.MergeCell(sheet, start, end); err != nil {
		return err
	}
	return f.SetCellStyle(sheet, start, end, styleID)
}

// setCellWithStyle écrit une valeur dans une cellule et applique un style
func (s *JuryService) setCellWithStyle(f *excelize.File, sheet, cell string, value any, styleID int) error {
	if err := f.SetCellValue(sheet, cell, value); err != nil {
		return err
	}
	return f.SetCellStyle(sheet, cell, cell, styleID)
}

// writeTableauRemplacements écrit le tableau récapitulatif des remplacements (grades N.E.)
// en dessous du tableau des rattrapages.
func (s *JuryService) writeTableauRemplacements(f *excelize.File, sheet string, data *JuryData) {
	if len(data.Remplacements) == 0 {
		return
	}

	rattrapagesRows := 0
	if len(data.Rattrapages) > 0 {
		rattrapagesRows = 2 + len(data.Rattrapages) // titre + en-têtes + lignes
	}

	// Ligne de départ : après le tableau des rattrapages + 2 lignes vides
	startRow := ueECTSRow + len(data.Students) + 3 + rattrapagesRows + 2

	// --- Titre ---
	titleCell := fmt.Sprintf("A%d", startRow)
	if err := s.setMergedCellWithStyle(f, sheet, titleCell, fmt.Sprintf("G%d", startRow),
		"TABLEAU RECAPITULATIF DES REMPLACEMENTS", s.styles[StyleBordureEpaisseCenterBleu]); err != nil {
		log.Printf("erreur titre tableau remplacements: %v", err)
	}

	// --- En-têtes colonnes ---
	headerRow := startRow + 1
	// Nom, Prénom, UE : colonnes simples A, B, C
	for i, h := range []string{"Nom", "Prénom", "UE"} {
		cell := fmt.Sprintf("%s%d", []string{"A", "B", "C"}[i], headerRow)
		if err := s.setCellWithStyle(f, sheet, cell, h, s.styles[StyleBordureEpaisseCenterBleu]); err != nil {
			log.Printf("erreur en-tête remplacement %s: %v", h, err)
		}
	}
	// Matières non évaluées : fusionnée D:G
	if err := s.setMergedCellWithStyle(f, sheet, fmt.Sprintf("D%d", headerRow), fmt.Sprintf("G%d", headerRow),
		"Matières non évaluées", s.styles[StyleBordureEpaisseCenterBleu]); err != nil {
		log.Printf("erreur en-tête remplacement Matières: %v", err)
	}

	// --- Lignes de données ---
	// Chaque RemplacementEntry peut avoir N matières → N lignes Excel.
	// Les colonnes Nom/Prénom/UE sont fusionnées sur ces N lignes.
	currentRow := headerRow + 1
	for i, r := range data.Remplacements {
		gris := i%2 == 1
		style := StyleBordureEpaisseCenter
		if gris {
			style = StyleBordureEpaisseCenterGris
		}
		nbMatieres := len(r.MatiereNoms)
		if nbMatieres == 0 {
			nbMatieres = 1
		}
		lastRow := currentRow + nbMatieres - 1

		// Colonnes Nom / Prénom / UE : fusionnées sur nbMatieres lignes
		for j, v := range []string{r.LastName, r.FirstName, r.UeNom} {
			topCell := fmt.Sprintf("%s%d", []string{"A", "B", "C"}[j], currentRow)
			if nbMatieres > 1 {
				bottomCell := fmt.Sprintf("%s%d", []string{"A", "B", "C"}[j], lastRow)
				if err := s.setMergedCellWithStyle(f, sheet, topCell, bottomCell, v, s.styles[style]); err != nil {
					log.Printf("erreur fusion remplacement col %d: %v", j, err)
				}
			} else {
				if err := s.setCellWithStyle(f, sheet, topCell, v, s.styles[style]); err != nil {
					log.Printf("erreur cellule remplacement col %d: %v", j, err)
				}
			}
		}

		// Colonne Matière : une ligne par matière, fusionnée D:G
		for k, matiere := range r.MatiereNoms {
			topCell := fmt.Sprintf("D%d", currentRow+k)
			endCell := fmt.Sprintf("G%d", currentRow+k)
			if err := s.setMergedCellWithStyle(f, sheet, topCell, endCell, matiere, s.styles[style]); err != nil {
				log.Printf("erreur matière remplacement: %v", err)
			}
		}

		currentRow += nbMatieres
	}
}

// writeTableauRattrapages écrit le tableau récapitulatif des rattrapages non validés
// en dessous du tableau principal, avec une ligne vide de séparation.
func (s *JuryService) writeTableauRattrapages(f *excelize.File, sheet string, data *JuryData) {
	if len(data.Rattrapages) == 0 {
		return
	}

	// Ligne de départ : après les étudiants + 2 lignes vides
	startRow := ueECTSRow + len(data.Students) + 3

	// --- Titre ---
	titleCell := fmt.Sprintf("A%d", startRow)
	if err := s.setMergedCellWithStyle(f, sheet, titleCell, fmt.Sprintf("H%d", startRow),
		"TABLEAU RECAPITULATIF DES RATTRAPAGES", s.styles[StyleBordureEpaisseCenterJaune]); err != nil {
		log.Printf("erreur titre tableau rattrapages: %v", err)
	}

	// --- En-têtes colonnes ---
	headerRow := startRow + 1
	// Nom, Prénom, Module : colonnes simples A, B, C
	for i, h := range []string{"Nom", "Prénom", "Module"} {
		cell := fmt.Sprintf("%s%d", []string{"A", "B", "C"}[i], headerRow)
		if err := s.setCellWithStyle(f, sheet, cell, h, s.styles[StyleBordureEpaisseCenterJaune]); err != nil {
			log.Printf("erreur en-tête rattrapage %s: %v", h, err)
		}
	}
	// Matière : fusionnée D:G
	if err := s.setMergedCellWithStyle(f, sheet, fmt.Sprintf("D%d", headerRow), fmt.Sprintf("G%d", headerRow),
		"Matière", s.styles[StyleBordureEpaisseCenterJaune]); err != nil {
		log.Printf("erreur en-tête rattrapage Matière: %v", err)
	}
	// Statut : colonne H
	if err := s.setCellWithStyle(f, sheet, fmt.Sprintf("H%d", headerRow), "Statut", s.styles[StyleBordureEpaisseCenterJaune]); err != nil {
		log.Printf("erreur en-tête rattrapage Statut: %v", err)
	}

	// --- Lignes de données ---
	for i, r := range data.Rattrapages {
		row := headerRow + 1 + i
		gris := i%2 == 1
		style := StyleBordureEpaisseCenter
		if gris {
			style = StyleBordureEpaisseCenterGris
		}

		// Colonnes simples A, B, C
		for j, v := range []any{r.LastName, r.FirstName, r.UeNom} {
			cell := fmt.Sprintf("%s%d", []string{"A", "B", "C"}[j], row)
			if err := s.setCellWithStyle(f, sheet, cell, v, s.styles[style]); err != nil {
				log.Printf("erreur ligne rattrapage: %v", err)
			}
		}
		// Matière : fusionnée D:G
		if err := s.setMergedCellWithStyle(f, sheet, fmt.Sprintf("D%d", row), fmt.Sprintf("G%d", row),
			r.MatiereNom, s.styles[style]); err != nil {
			log.Printf("erreur matière rattrapage: %v", err)
		}
		// Statut : colonne H
		if err := s.setCellWithStyle(f, sheet, fmt.Sprintf("H%d", row), "A évaluer", s.styles[style]); err != nil {
			log.Printf("erreur statut rattrapage: %v", err)
		}
	}
}
