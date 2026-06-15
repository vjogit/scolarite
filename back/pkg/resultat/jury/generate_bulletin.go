package jury

import (
	"archive/zip"
	"cyb-react/pkg/services"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

//go:embed template_bulletin.docx
var templateBulletinBytes []byte

// BulletinParams contient les informations fournies par la secrétaire pour personnaliser les bulletins.
type BulletinParams struct {
	EnteteLigne1   string `json:"entete_ligne_1"`
	EnteteLigne2   string `json:"entete_ligne_2"`
	EnteteLigne3   string `json:"entete_ligne_3"`
	EnteteLigne4   string `json:"entete_ligne_4"`
	EnteteLigne5   string `json:"entete_ligne_5"`
	Periode        string `json:"periode"`
	EnteteUE       string `json:"entete_ue"`
	DateJury       string `json:"date_jury"`
	NomResponsable string `json:"nom_responsable"`
}

func GenerateJuryBulletins(w http.ResponseWriter, r *http.Request) {
	periodeID := chi.URLParam(r, "periodeID")
	if periodeID == "" {
		services.InvalidRequestError(w, r, "pas d'id de periode", services.MISSING_PARAM, nil)
		return
	}

	id, err := strconv.Atoi(periodeID)
	if err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	var params BulletinParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		services.InvalidRequestError(w, r, "body JSON invalide", services.INVALID_BODY, err)
		return
	}

	juryService := NewJuryService(getQueriesFromCtx(r), int32(id))

	juryData, err := juryService.PrepareJuryData(r.Context())
	if err != nil {
		services.InternalServerError(w, r, "Erreur lors de la récupération des données du jury", services.INTERNAL_ERROR, err)
		return
	}

	// Le générateur lit le template une seule fois pour tous les bulletins
	gen := NewGeneratorFromBytes(templateBulletinBytes)

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"bulletins_jury_%s.zip\"", periodeID))

	if err = GenerateJuryBulletinsZip(gen, juryData, params, w); err != nil {
		fmt.Printf("Erreur lors de la génération du ZIP: %v\n", err)
	}
}

// GenerateJuryBulletinsZip génère un fichier ZIP contenant les bulletins de chaque étudiant.
func GenerateJuryBulletinsZip(gen *Generator, juryData *JuryData, params BulletinParams, w io.Writer) error {
	archive := zip.NewWriter(w)
	defer archive.Close()

	for _, student := range juryData.Students {
		// Convertir les données jury en modèle Bulletin
		bulletin := studentEntryToBulletin(student, juryData, params)

		// Déléguer la génération au Generator
		bulletinBytes, err := gen.GenerateBytes(bulletin)
		if err != nil {
			return fmt.Errorf("erreur génération bulletin %s %s : %w",
				safeStr(student.JuryStat.LastName),
				safeStr(student.JuryStat.FirstName),
				err,
			)
		}

		fileNameInZip := fmt.Sprintf("Bulletin_%s_%s.docx",
			safeStr(student.JuryStat.LastName),
			safeStr(student.JuryStat.FirstName),
		)

		writer, err := archive.Create(fileNameInZip)
		if err != nil {
			return fmt.Errorf("erreur création entrée ZIP %s : %w", fileNameInZip, err)
		}

		if _, err := writer.Write(bulletinBytes); err != nil {
			return fmt.Errorf("erreur écriture ZIP %s : %w", fileNameInZip, err)
		}
	}

	return nil
}

// studentEntryToBulletin convertit un StudentEntry + JuryData en Bulletin.
// Chaque UE devient un Module avec une seule Matiere (grade + ECTS).
func studentEntryToBulletin(student StudentEntry, juryData *JuryData, params BulletinParams) Bulletin {
	gpaStr := "N/A"
	if student.JuryStat.GpaPeriode != nil {
		gpaStr = fmt.Sprintf("%.2f", *student.JuryStat.GpaPeriode)
	}

	var modules []Module
	var nonValides []string

	if juryData.Hierarchy != nil {
		for _, ue := range juryData.Hierarchy.UEs {
			stat, exists := juryData.StatsUe[student.UserID][ue.ID]

			grade := "-"
			if exists && stat.GradeLettre != nil {
				grade = *stat.GradeLettre
			}

			if grade == "F" {
				nonValides = append(nonValides, ue.Nom)
			}

			modules = append(modules, Module{
				Nom: ue.Nom,
				Matieres: []Matiere{
					{
						Nom:        strings.Join(ue.Matieres, ", "),
						Evaluation: grade,
						Credits:    fmt.Sprintf("%.0f", ue.ECTS),
					},
				},
			})
		}
	}

	return Bulletin{
		Nom:                        safeStr(student.JuryStat.LastName),
		Prenom:                     safeStr(student.JuryStat.FirstName),
		Modules:                    modules,
		NombreCreditsValides:       student.JuryStat.TotalEctsValides,
		NombreCreditsTotal:         student.JuryStat.TotalEctsPeriode,
		GPA:                        gpaStr,
		ModulesNonValides:          nonValides,
		CumuleCredit:               student.JuryStat.TotalEctsValidesCumule,
		CumulCreditTotal:           student.JuryStat.TotalEctsCumule,
		GPACumule:                  safeStrFloat(student.JuryStat.GPACumule),
		TOEIC:                      safeStr(student.JuryStat.TOEIC),
		ModulesNonValidesPrecedent: []string{}, // a faire
		DecisionJury:               safeStr(student.JuryStat.DecisionJury),

		EnteteLigne1:   params.EnteteLigne1,
		EnteteLigne2:   params.EnteteLigne2,
		EnteteLigne3:   params.EnteteLigne3,
		EnteteLigne4:   params.EnteteLigne4,
		EnteteLigne5:   params.EnteteLigne5,
		Periode:        params.Periode,
		EnteteUE:       params.EnteteUE,
		DateJury:       params.DateJury,
		NomResponsable: params.NomResponsable,
	}
}

// safeStr déréférence un *string en toute sécurité.
func safeStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// safeStr déréférence un *string en toute sécurité.
func safeStrFloat(s *float64) string {
	if s == nil {
		return ""
	}
	return fmt.Sprintf("%0.2f", *s)
}
