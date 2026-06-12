package exchange

import (
	"context"
	"errors"
	"fmt"
	"math"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cyb-react/pkg/services"
	matiereGen "cyb-react/pkg/structure/matiere/gen"
	"cyb-react/pkg/structure/option"
	periodeGen "cyb-react/pkg/structure/periode/gen"
	ueGen "cyb-react/pkg/structure/unite_enseignement/gen"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/xuri/excelize/v2"
)

const (
	TypePeriode  = "Semestre"
	TypeUE       = "Module" // Correspond à UniteEnseignement dans le fichier Excel
	TypeMatiere  = "Matiere"
	TypeInconnue = "Inconnue"
)

type typePattern struct {
	Name    string
	Pattern []CellState
}

type CellState int

const (
	CellStateVide CellState = iota
	CellStateRempli
	CellStateOptionnel
)

var typePatterns = []typePattern{
	{TypePeriode, []CellState{CellStateRempli, CellStateVide, CellStateVide, CellStateVide}},
	{TypeUE, []CellState{CellStateRempli, CellStateRempli, CellStateOptionnel, CellStateVide, CellStateRempli}},
	{TypeMatiere, []CellState{CellStateVide, CellStateRempli, CellStateRempli, CellStateRempli}},
}

// Structures intermédiaires pour le parsing
type PeriodeRequest struct {
	Name  string
	Debut time.Time
	Fin   time.Time
	UEs   []UeRequest
}

type UeRequest struct {
	Name     string
	Ects     float32
	Matieres []MatiereRequest
}

type MatiereRequest struct {
	Name  string
	Heure float32
	Coeff float32
}

func ImportPeriode(w http.ResponseWriter, r *http.Request) {

	option_ := option.GetOptionFromCtx(r)

	// Parse le multipart form (taille max 10 Mo ici)
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		services.InvalidRequestError(w, r, "erreur lors du parsing du formulaire (fichier trop volumineux ?)", services.FILE_TOO_LARGE, nil)
		return
	}

	// Récupère le fichier (le champ doit s'appeler "file")
	file, header, err := r.FormFile("file")
	if err != nil {
		services.InvalidRequestError(w, r, "fichier manquant (champ 'file')", services.FILE_MISSING, nil)
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".xlsx") {
		services.InvalidRequestError(w, r, "le fichier doit avoir l'extension .xlsx", services.INVALID_FILE_EXTENSION, nil)
		return
	}

	err = ImportPeriodeFromExcel(r.Context(), file, int(option_.ID))
	if err != nil {
		// Distinction des erreurs 400 vs 500
		msg := err.Error()
		if strings.Contains(msg, "transaction") {
			services.InternalServerError(w, r, "Erreur interne lors de l'import", services.INTERNAL_ERROR, err)
		} else {
			services.InvalidRequestError(w, r, msg, services.NO_INFORMATION, nil)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ImportOptionFromExcel est le point d'entrée pour traiter le fichier Excel et sauvegarder les données
func ImportPeriodeFromExcel(ctx context.Context, file multipart.File, idOption int) error {
	f, err := excelize.OpenReader(file)
	if err != nil {
		return fmt.Errorf("erreur lecture fichier Excel: %w", err)
	}
	defer f.Close()

	// ne prends que la premiere feuille
	sheetNames := f.GetSheetList()

	if len(sheetNames) == 0 {
		return errors.New("pas de données dans le fichier à importer")
	}

	rows, err := f.GetRows(sheetNames[0])
	if err != nil {
		return fmt.Errorf("erreur lecture lignes Excel: %w", err)
	}

	offset := getOffset(rows)
	var filteredRows [][]string

	// supprime la/les colonnes vide du debut, et les lignes vides
	for _, row := range rows {
		if len(row) == 0 {
			continue
		}
		filterRow := row[offset:]
		filteredRows = append(filteredRows, filterRow)
	}

	periodes, err := parseExcelStructure(&filteredRows)
	if err != nil {
		return fmt.Errorf("erreur de structure du fichier: %w", err)
	}

	return runInTransaction(ctx, func(ctx context.Context, tx pgx.Tx) error {
		return persistPeriodes(ctx, tx, periodes, idOption)
	})

}

func parseExcelStructure(rows *[][]string) ([]PeriodeRequest, error) {
	periodes := make([]PeriodeRequest, 0)
	for len(*rows) > 0 {
		ligne := (*rows)[0]
		switch typeFormation := getType(ligne); typeFormation {
		case TypePeriode:
			nextPeriodes := parsePeriodes(rows)
			periodes = append(periodes, nextPeriodes...)
		case TypeInconnue:
			consumeRow(rows)
		default:
			return nil, errors.New("attend semestre, mais  trouve " + typeFormation)
		}
	}
	return periodes, nil
}

func parsePeriodes(rows *[][]string) []PeriodeRequest {
	ligne := (*rows)[0]

	periodes := []PeriodeRequest{{
		Name:  ligne[0],
		Debut: time.Now(),
		Fin:   time.Now().Add(24 * time.Hour),
	}}

	consumeRow(rows)
	boucle := true

	for boucle {
		if len(*rows) > 0 {
			nextLigne := (*rows)[0]
			switch getType(nextLigne) {
			case TypePeriode:
				nextPeriodes := parsePeriodes(rows)
				periodes = append(periodes, nextPeriodes...)
			case TypeUE:
				nextUEs := parseUEs(rows)
				periodes[len(periodes)-1].UEs = append(periodes[len(periodes)-1].UEs, nextUEs...)
			case TypeInconnue:
				consumeRow(rows)
				boucle = true // continue la boucle pour traiter la ligne suivante
			default:
				boucle = false // sort de la boucle si on ne trouve pas de module
			}
		} else {
			boucle = false
		}
	}

	return periodes
}

func parseUEs(rows *[][]string) []UeRequest {
	ligne := (*rows)[0]

	ues := []UeRequest{{
		Name: ligne[0],
	}}

	if ects, err := strconv.ParseFloat(ligne[4], 32); err == nil {
		ues[0].Ects = float32(ects)
	}

	consumeRow(rows)
	boucle := true

	for boucle {
		if len(*rows) > 0 {
			nextLigne := (*rows)[0]
			switch getType(nextLigne) {
			case TypeUE:
				nextUEs := parseUEs(rows)
				ues = append(ues, nextUEs...)
			case TypeMatiere:
				nextMatieres := parseMatieres(rows)
				ues[len(ues)-1].Matieres = append(ues[len(ues)-1].Matieres, nextMatieres...)
			case TypeInconnue:
				consumeRow(rows)
				boucle = true // continue la boucle pour traiter la ligne suivante
			default:
				boucle = false // sort de la boucle si on ne trouve pas de module
			}
		} else {
			boucle = false
		}
	}

	return ues
}

func parseMatieres(rows *[][]string) []MatiereRequest {
	ligne := (*rows)[0]

	matieres := []MatiereRequest{{
		Name: ligne[1],
	}}

	if heures, err := strconv.ParseFloat(ligne[2], 32); err == nil {
		matieres[0].Heure = float32(heures)
	}

	if len(ligne) > 3 {
		if coeff, err := strconv.ParseFloat(ligne[3], 32); err == nil {
			matieres[0].Coeff = float32(coeff)
		}
	}

	consumeRow(rows)
	boucle := true

	for boucle {
		if len(*rows) > 0 {
			nextLigne := (*rows)[0]
			switch getType(nextLigne) {
			case TypeMatiere:
				nextMatieres := parseMatieres(rows)
				matieres = append(matieres, nextMatieres...)
			case TypeInconnue:
				consumeRow(rows) // supprime
				boucle = true    // continue la boucle pour traiter la ligne suivante
			default:
				boucle = false // sort de la boucle si on ne trouve pas de module
			}
		} else {
			boucle = false
		}
	}

	return matieres
}

func consumeRow(rows *[][]string) {
	*rows = (*rows)[1:]
}

func getOffset(records [][]string) int {
	min := math.MaxInt
	// Cherche le premier index où la première colonne n'est pas vide
	for _, ligne := range records {
		// Optimisation : si on a déjà trouvé un offset de 0, on ne peut pas faire mieux
		if min == 0 {
			return 0
		}
		for i, colonne := range ligne {
			if colonne != "" {
				if i < min {
					min = i
				}
				break // On sort de la boucle dès qu'on trouve le premier index non vide
			}
		}
	}
	return min
}

func getType(ligne []string) string {
	if len(ligne) == 0 {
		return TypeInconnue
	}

	for _, tp := range typePatterns {
		match := true
		minLen := min(len(tp.Pattern), len(ligne))

		for i := range minLen {
			if tp.Pattern[i] == CellStateOptionnel {
				continue // Ignore les cellules optionnelles
			}

			var state CellState
			if ligne[i] == "" {
				state = CellStateVide
			} else {
				state = CellStateRempli
			}

			if tp.Pattern[i] != state {
				match = false
				break
			}
		}
		if match {
			return tp.Name
		}
	}
	return TypeInconnue
}

func persistPeriodes(ctx context.Context, tx pgx.Tx, periodes []PeriodeRequest, idOption int) error {
	queries := periodeGen.New(tx)

	for _, periode := range periodes {
		idPeriode, err := queries.CreatePeriode(ctx, periodeGen.CreatePeriodeParams{
			Name:     periode.Name,
			OptionID: int32(idOption),
			Debut:    pgtype.Timestamptz{Time: periode.Debut, Valid: true},
			Fin:      pgtype.Timestamptz{Time: periode.Fin, Valid: true},
		})
		if err != nil {
			return err
		}
		if err = persistUEs(ctx, tx, periode.UEs, int(idPeriode)); err != nil {
			return err
		}
	}
	return nil
}

func persistUEs(ctx context.Context, tx pgx.Tx, ues []UeRequest, periodeId int) error {
	queries := ueGen.New(tx)

	for _, ue := range ues {
		idUE, err := queries.CreateUniteEnseignement(ctx, ueGen.CreateUniteEnseignementParams{
			Name:      ue.Name,
			PeriodeID: int32(periodeId),
			Ects:      ue.Ects,
		})
		if err != nil {
			return err
		}
		if err = persistMatieres(ctx, tx, ue.Matieres, int(idUE)); err != nil {
			return err
		}

	}
	return nil
}

func persistMatieres(ctx context.Context, tx pgx.Tx, matieres []MatiereRequest, ueId int) error {
	queries := matiereGen.New(tx)

	for _, matiere := range matieres {
		_, err := queries.CreateMatiere(ctx, matiereGen.CreateMatiereParams{
			Name:                matiere.Name,
			UniteEnseignementID: int32(ueId),
			Heure:               matiere.Heure,
			Coeff:               matiere.Coeff,
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func runInTransaction(ctx context.Context, handler func(ctx context.Context, tx pgx.Tx) error) error {
	pgCtx := services.GetPgCtx(ctx)

	tx, err := pgCtx.Db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("erreur début transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := handler(ctx, tx); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("erreur commit transaction: %w", err)
	}
	return nil
}
