package note

import (
	"bytes"
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/xuri/excelize/v2"
)

const templateNotePath = "/home/vjo/projets/cybema/cyb-react/back/pkg/templates/Template_note.xlsx"

type FicheData struct {
	Formation   string
	Annee       string
	Intervenant string
	Controle    string
	ControleId  string
	Matiere     string
	Module      string
	Coeff       string
	Date        string
	Eleves      []EleveFiche
}

type EleveFiche struct {
	ID     int
	Nom    string
	Prenom string
}

func fetchFicheExport(w http.ResponseWriter, r *http.Request) {
	controleIDStr := r.URL.Query().Get("controle_id")
	if controleIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: controle_id", services.MISSING_PARAM, nil)
		return
	}
	controleID, err := strconv.Atoi(controleIDStr)
	if err != nil {
		services.InvalidRequestError(w, r, "controle_id invalide", services.INVALID_PARAM, nil)
		return
	}

	groupeIDStr := r.URL.Query().Get("groupe_id")
	if groupeIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: groupe_id", services.MISSING_PARAM, nil)
		return
	}
	groupeID, err := strconv.Atoi(groupeIDStr)
	if err != nil {
		services.InvalidRequestError(w, r, "groupe_id invalide", services.INVALID_PARAM, nil)
		return
	}

	info, eleves, err := fetchFicheData(r, controleID, groupeID)
	if err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	d := buildFicheData(info, eleves)

	buf, err := generateFiche(d)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	filename := fmt.Sprintf("fiche_%d.xlsx", controleID)
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Write(buf.Bytes())
}

func buildFicheData(info *gen.FetchInformationsFicheRow, eleves *[]gen.FetchElevesFicheRow) *FicheData {
	intervenant := ""
	if info.Responsable != nil {
		intervenant = fmt.Sprintf("%v", info.Responsable)
	}

	var elevesData []EleveFiche
	for _, e := range *eleves {
		elevesData = append(elevesData, EleveFiche{
			ID:     int(e.ID),
			Nom:    e.Lastname,
			Prenom: e.Firstname,
		})
	}

	return &FicheData{
		Formation:   info.Name,
		Annee:       strconv.Itoa(int(info.Annee)),
		Intervenant: intervenant,
		Controle:    info.ControleName,
		ControleId:  strconv.Itoa(int(info.ControleID)),
		Matiere:     info.MatiereName,
		Module:      info.UeName,
		Coeff:       info.CCoeff,
		Date:        time.Now().Format("02/01/2006"),
		Eleves:      elevesData,
	}
}

func fetchFicheData(r *http.Request, controleID int, groupeID int) (*gen.FetchInformationsFicheRow, *[]gen.FetchElevesFicheRow, error) {
	queries := getQueriesFromCtx(r)

	fetchInformationsFicheRow, err := queries.FetchInformationsFiche(r.Context(), int32(controleID))
	if err == pgx.ErrNoRows {
		return nil, nil, fmt.Errorf("contrôle id=%d introuvable", controleID)
	}
	if err != nil {
		return nil, nil, fmt.Errorf("requête fiche: %w", err)
	}

	fetchElevesFicheRow, err := queries.FetchElevesFiche(r.Context(), gen.FetchElevesFicheParams{
		ControleID: int32(controleID),
		GroupeID:   int32(groupeID),
	})
	if err != nil {
		return nil, nil, fmt.Errorf("requête élèves: %w", err)
	}

	return &fetchInformationsFicheRow, &fetchElevesFicheRow, nil
}

func generateFiche(d *FicheData) (*bytes.Buffer, error) {
	f, err := excelize.OpenFile(templateNotePath)
	if err != nil {
		return nil, fmt.Errorf("ouverture Template_note.xlsx: %w", err)
	}
	defer f.Close()

	const sheet = "Feuille1"

	replacePlaceholders(f, sheet, map[string]string{
		"${FORMATION}":   d.Formation,
		"${ANNEE}":       d.Annee,
		"${INTERVENANT}": d.Intervenant,
		"${CONTROLE}":    d.Controle,
		"${CONTROLE_ID}": d.ControleId,
		"${MATIERE}":     d.Matiere,
		"${MODULE}":      d.Module,
		"${COEFF}":       d.Coeff,
		"${DATE}":        d.Date,
	})

	styleIdentite, _ := f.NewStyle(&excelize.Style{
		Border: []excelize.Border{
			{Type: "left", Color: "000000", Style: 1},
			{Type: "right", Color: "000000", Style: 1},
			{Type: "top", Color: "000000", Style: 1},
			{Type: "bottom", Color: "000000", Style: 1},
		},
		Font:      &excelize.Font{Family: "Arial", Size: 10},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})

	styleNote, _ := f.NewStyle(&excelize.Style{
		Border: []excelize.Border{
			{Type: "left", Color: "000000", Style: 1},
			{Type: "right", Color: "000000", Style: 1},
			{Type: "top", Color: "000000", Style: 1},
			{Type: "bottom", Color: "000000", Style: 1},
		},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"FFFFD9"}, Pattern: 1},
		Font:      &excelize.Font{Family: "Arial", Size: 10},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})

	const firstRow = 14
	for i, e := range d.Eleves {
		row := firstRow + i
		rowS := strconv.Itoa(row)
		f.SetCellInt(sheet, "A"+rowS, int64(e.ID))
		f.SetCellStr(sheet, "B"+rowS, e.Nom)
		f.SetCellStr(sheet, "C"+rowS, e.Prenom)
		f.SetCellStyle(sheet, "A"+rowS, "C"+rowS, styleIdentite)
		f.SetCellStyle(sheet, "D"+rowS, "D"+rowS, styleNote)
		f.SetRowHeight(sheet, row, 18)
	}

	f.SetColWidth(sheet, "A", "A", 10)
	f.SetColWidth(sheet, "B", "B", 22)
	f.SetColWidth(sheet, "C", "C", 22)
	f.SetColWidth(sheet, "D", "D", 10)

	return f.WriteToBuffer()
}

func replacePlaceholders(f *excelize.File, sheet string, repl map[string]string) {
	rows, err := f.GetRows(sheet)
	if err != nil {
		return
	}
	for r, row := range rows {
		for c, cell := range row {
			if !strings.Contains(cell, "${") {
				continue
			}
			newVal := cell
			for k, v := range repl {
				newVal = strings.ReplaceAll(newVal, k, v)
			}
			if newVal != cell {
				coord, _ := excelize.CoordinatesToCellName(c+1, r+1)
				f.SetCellStr(sheet, coord, newVal)
			}
		}
	}
}
