package jury

import (
	"context"
	"fmt"
	"sort"
)

// Ue représente une unité d'enseignement
type Ue struct {
	ID       int32    `json:"id"`
	Nom      string   `json:"nom"`
	ECTS     float32  `json:"ects"`
	Matieres []string `json:"matieres"`
}

// Hierarchie représente la hiérarchie des UEs pour une période
type Hierarchie struct {
	Periode string `json:"periode"`
	UEs     []Ue   `json:"ues"`
}

// RattrapageEntry représente un rattrapage non validé pour un étudiant
type RattrapageEntry struct {
	FirstName  string
	LastName   string
	UeNom      string
	MatiereNom string
}

// RemplacementEntry représente un remplacement (grade N.E.) pour un étudiant
type RemplacementEntry struct {
	FirstName   string
	LastName    string
	UeNom       string
	MatiereNoms []string
}

// JuryData contient toutes les données nécessaires pour générer le fichier Excel du jury.
type JuryData struct {
	Hierarchy     *Hierarchie                `json:"hierarchy"`
	Students      []StudentEntry             `json:"students"`
	StatsUe       map[int32]map[int32]UeStat `json:"statsUe"`
	Rattrapages   []RattrapageEntry          `json:"rattrapages"`
	Remplacements []RemplacementEntry        `json:"remplacements"`
}

type StudentEntry struct {
	UserID   int32    `json:"userID"`
	JuryStat JuryStat `json:"juryStat"`
}

type UeStat struct {
	MoyenneUe   *float64 `json:"moyenne_ue"`
	GradeLettre *string  `json:"grade_lettre"`
	Nom         *string  `json:"nom"`
	ECTS        *float32 `json:"ects"`
	Prenom      *string  `json:"prenom"`
}

type JuryStat struct {
	FirstName              *string  `json:"firstName"`
	LastName               *string  `json:"lastName"`
	GpaPeriode             *float64 `json:"gpa_periode"`
	GpaAcademiquePeriode   *float64 `json:"gpa_academique_periode"`
	TotalEctsValides       *float64 `json:"total_ects_valides"`
	TotalEctsPeriode       *float64 `json:"total_ects_periode"`
	TotalEctsValidesCumule *float64 `json:"total_ects_valides_cumule"`
	TotalEctsCumule        *float64 `json:"total_ects_cumule"`
	GPACumule              *float64 `json:"gpa_cumule"`
	TOEIC                  *string  `json:"toeic"`
	MobiliteValide         *bool    `json:"mobilite_valide"`
	DecisionJury           *string  `json:"decision_jury"`
}

// PrepareJuryData récupère et organise toutes les données nécessaires pour le rapport du jury.
func (s *JuryService) PrepareJuryData(ctx context.Context) (*JuryData, error) {
	// 1. Récupérer la hiérarchie (période et UEs)
	hierarchie, err := s.getHierarchy(ctx)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération de la hiérarchie: %w", err)
	}

	// 2. Récupérer les statistiques des étudiants (GPA et notes par UE)
	gpaMap, statsUeMap, err := s.fetchElevesStats(ctx)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des statistiques des étudiants: %w", err)
	}

	// 3. Récupérer les scores TOEIC par étudiant
	toeicMap, err := s.fetchToeicScores(ctx)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des scores TOEIC: %w", err)
	}

	// 4. Récupérer la validité des mobilités par étudiant
	mobiliteMap, err := s.fetchMobiliteValidite(ctx)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des mobilités: %w", err)
	}

	// 5. Enrichir le gpaMap avec les données TOEIC et mobilité
	for userID, stat := range gpaMap {
		if score, ok := toeicMap[userID]; ok {
			s := fmt.Sprintf("%d", score)
			stat.TOEIC = &s
		}
		if valide, ok := mobiliteMap[userID]; ok {
			v := valide
			stat.MobiliteValide = &v
		}
		gpaMap[userID] = stat
	}

	// 6. Récupérer les rattrapages non validés
	rattrapages, err := s.fetchRattrapages(ctx)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des rattrapages: %w", err)
	}

	// 7. Trie des étudiants
	students := s.sortedStudents(gpaMap)

	// 8. Récupérer les matières non évaluées (remplacements)
	remplacements, err := s.fetchRemplacements(ctx)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des remplacements: %w", err)
	}

	// 9. Retourner les données consolidées
	return &JuryData{
		Hierarchy:     hierarchie,
		Students:      students,
		StatsUe:       statsUeMap,
		Rattrapages:   rattrapages,
		Remplacements: remplacements,
	}, nil
}

// fetchRemplacements récupère les matières non évaluées groupées par étudiant/UE
func (s *JuryService) fetchRemplacements(ctx context.Context) ([]RemplacementEntry, error) {
	rows, err := s.queries.FetchMatieresNonEvaluesByPeriodeID(ctx, s.periodeID)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des matières non évaluées: %v", err)
	}

	// Regrouper les matières par (userID, ueNom)
	type key struct {
		userID int32
		ueNom  string
	}
	indexMap := make(map[key]int)
	// Allouée d'emblée, pour la même raison que `Hierarchie.UEs`.
	result := make([]RemplacementEntry, 0)

	for _, r := range rows {
		k := key{r.UserID, r.UeNom}
		if idx, exists := indexMap[k]; exists {
			result[idx].MatiereNoms = append(result[idx].MatiereNoms, r.MatiereNom)
		} else {
			indexMap[k] = len(result)
			result = append(result, RemplacementEntry{
				FirstName:   r.FirstName,
				LastName:    r.LastName,
				UeNom:       r.UeNom,
				MatiereNoms: []string{r.MatiereNom},
			})
		}
	}
	return result, nil
}

// getHierarchy récupère la hiérarchie des UEs pour une période donnée, avec leurs matières
func (s *JuryService) getHierarchy(ctx context.Context) (*Hierarchie, error) {
	hierarchy := &Hierarchie{}

	periode, err := s.queries.FetchPeriodeById(ctx, s.periodeID)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération de la période: %v", err)
	}
	hierarchy.Periode = periode.Name

	ues, err := s.queries.FetchUniteEnseignementsByPeriodeID(ctx, s.periodeID)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des UEs: %v", err)
	}

	// Charger toutes les matières de la période, indexées par ueID
	matiereRows, err := s.queries.FetchMatieresByPeriodeID(ctx, s.periodeID)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des matières: %v", err)
	}
	matieresByUe := make(map[int32][]string)
	for _, m := range matiereRows {
		matieresByUe[m.UeID] = append(matieresByUe[m.UeID], m.MatiereNom)
	}

	// Tranche allouée même vide : une tranche nil se sérialise en `null`, et le
	// client attend un tableau. Une période sans UE est un état normal — elle
	// vient d'être créée — et ne doit pas faire tomber l'écran de jury.
	hierarchy.UEs = make([]Ue, 0, len(ues))
	for _, ue := range ues {
		matieres := matieresByUe[ue.ID]
		if matieres == nil {
			matieres = []string{}
		}
		hierarchy.UEs = append(hierarchy.UEs, Ue{
			ID:       ue.ID,
			Nom:      ue.Name,
			ECTS:     ue.Ects,
			Matieres: matieres,
		})
	}

	return hierarchy, nil
}

// fetchElevesStats récupère depuis la DB les données GPA et notes par UE de chaque étudiant
func (s *JuryService) fetchElevesStats(ctx context.Context) (map[int32]JuryStat, map[int32]map[int32]UeStat, error) {
	//rows, err := s.queries.FetchGpaAndUesByPeriodeID(ctx, s.periodeID)
	rows, err := s.queries.Get_gpa_ues_by_periode_v5(ctx, s.periodeID)
	if err != nil {
		return nil, nil, fmt.Errorf("erreur lors de la récupération des notes: %v", err)
	}

	gpaMap := make(map[int32]JuryStat)
	statsUeMap := make(map[int32]map[int32]UeStat) // [UserID][UeID] -> UeStat

	for _, row := range rows {

		if row.UserID == 1 {
			fmt.Print("f")
		}
		// Le GPA est identique sur toutes les lignes d'un même étudiant, on écrase sans risque
		gpaMap[row.UserID] = JuryStat{
			FirstName:              row.FirstName,
			LastName:               row.LastName,
			GpaPeriode:             row.GpaPeriode,
			GpaAcademiquePeriode:   row.GpaAcademiquePeriode,
			TotalEctsValidesCumule: row.TotalEctsValidesCumule,
			TotalEctsCumule:        row.TotalEctsCumule,
			TotalEctsValides:       row.TotalEctsValides,
			TotalEctsPeriode:       row.TotalEctsPeriode,
			GPACumule:              row.GpaCumule,
			DecisionJury:           nil, // a faire
		}

		if _, exists := statsUeMap[row.UserID]; !exists {
			statsUeMap[row.UserID] = make(map[int32]UeStat)
		}
		statsUeMap[row.UserID][row.UniteEnseignementID] = UeStat{
			MoyenneUe:   row.MoyenneUe,
			GradeLettre: row.GradeLettre,
		}
	}

	return gpaMap, statsUeMap, nil
}

// fetchToeicScores récupère le meilleur score TOEIC par étudiant pour la période
func (s *JuryService) fetchToeicScores(ctx context.Context) (map[int32]int32, error) {
	rows, err := s.queries.FetchToeicScoresByPeriodeID(ctx, s.periodeID)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des scores TOEIC: %v", err)
	}
	result := make(map[int32]int32, len(rows))
	for _, r := range rows {
		result[r.TUserID] = r.Score
	}
	return result, nil
}

// fetchRattrapages récupère les rattrapages non validés pour la période
func (s *JuryService) fetchRattrapages(ctx context.Context) ([]RattrapageEntry, error) {
	rows, err := s.queries.FetchRattrapagesNonValidesByPeriodeID(ctx, s.periodeID)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des rattrapages: %v", err)
	}
	result := make([]RattrapageEntry, 0, len(rows))
	for _, r := range rows {
		result = append(result, RattrapageEntry{
			FirstName:  r.FirstName,
			LastName:   r.LastName,
			UeNom:      r.UeNom,
			MatiereNom: r.MatiereNom,
		})
	}
	return result, nil
}

// fetchMobiliteValidite récupère la validité de mobilité par étudiant pour la période
func (s *JuryService) fetchMobiliteValidite(ctx context.Context) (map[int32]bool, error) {
	rows, err := s.queries.FetchMobiliteValiditeByPeriodeID(ctx, s.periodeID)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la récupération des mobilités: %v", err)
	}
	result := make(map[int32]bool, len(rows))
	for _, r := range rows {
		result[r.MUserID] = r.EstValide
	}
	return result, nil
}

// sortedStudents retourne les étudiants triés par nom puis prénom
func (s *JuryService) sortedStudents(gpaMap map[int32]JuryStat) []StudentEntry {
	students := make([]StudentEntry, 0, len(gpaMap))
	for userID, juryStat := range gpaMap {
		students = append(students, StudentEntry{userID, juryStat})
	}

	sort.Slice(students, func(i, j int) bool {
		lastI, lastJ, firstI, firstJ := "", "", "", ""
		if students[i].JuryStat.LastName != nil {
			lastI = *students[i].JuryStat.LastName
		}
		if students[j].JuryStat.LastName != nil {
			lastJ = *students[j].JuryStat.LastName
		}
		if lastI != lastJ {
			return lastI < lastJ
		}
		if students[i].JuryStat.FirstName != nil {
			firstI = *students[i].JuryStat.FirstName
		}
		if students[j].JuryStat.FirstName != nil {
			firstJ = *students[j].JuryStat.FirstName
		}
		return firstI < firstJ
	})

	return students
}
