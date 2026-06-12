package exchange

import (
	"fmt"
	"net/http"

	"cyb-react/pkg/services"
	matiereGen "cyb-react/pkg/structure/matiere/gen"
	"cyb-react/pkg/structure/option"
	periodeGen "cyb-react/pkg/structure/periode/gen"
	ueGen "cyb-react/pkg/structure/unite_enseignement/gen"

	"github.com/xuri/excelize/v2"
)

// ExportPeriode génère un fichier Excel contenant la structure complète (Périodes > UEs > Matières) pour une option donnée.
func ExportPeriode(w http.ResponseWriter, r *http.Request) {
	option_ := option.GetOptionFromCtx(r)

	ctx := r.Context()
	pgCtx := services.GetPgCtx(ctx)

	// 2. Récupération des données hiérarchiques
	// Périodes
	pQueries := periodeGen.New(pgCtx.Db)
	periodes, err := pQueries.FetchPeriodesByOptionID(ctx, int32(option_.ID))
	if err != nil {
		services.InternalServerError(w, r, "Erreur lors de la récupération des périodes", services.INTERNAL_ERROR, err)
		return
	}

	// 3. Création du fichier Excel
	f := excelize.NewFile()
	defer f.Close()

	// On renomme la feuille par défaut
	sheetName := "Programme"
	f.SetSheetName("Sheet1", sheetName)

	rowIdx := 1
	ueQueries := ueGen.New(pgCtx.Db)
	mQueries := matiereGen.New(pgCtx.Db)

	for _, p := range periodes {
		// --- Période ---
		// Pattern Import: [Rempli, Vide, Vide, Vide] -> Col A
		f.SetCellStr(sheetName, fmt.Sprintf("A%d", rowIdx), p.Name)
		rowIdx++

		ues, err := ueQueries.FetchUniteEnseignementsByPeriodeID(ctx, p.ID)
		if err != nil {
			services.InternalServerError(w, r, "Erreur lors de la récupération des UEs", services.INTERNAL_ERROR, err)
			return
		}

		for _, ue := range ues {
			// --- UE ---
			// Pattern Import: [Rempli, Rempli, Optionnel, Vide, Rempli]
			// Col A: Nom
			// Col B: Nom (Duplication pour satisfaire le pattern 'Rempli' à l'index 1 de l'import)
			// Col E: ECTS
			f.SetCellStr(sheetName, fmt.Sprintf("A%d", rowIdx), ue.Name)
			f.SetCellStr(sheetName, fmt.Sprintf("B%d", rowIdx), ue.Name)
			f.SetCellFloat(sheetName, fmt.Sprintf("E%d", rowIdx), float64(ue.Ects), 2, 64)
			rowIdx++

			matieres, err := mQueries.FetchMatieresByUniteEnseignementID(ctx, ue.ID)
			if err != nil {
				services.InternalServerError(w, r, "Erreur lors de la récupération des matières", services.INTERNAL_ERROR, err)
				return
			}

			for _, m := range matieres {
				// --- Matière ---
				// Pattern Import: [Vide, Rempli, Rempli, Rempli]
				// Col B: Nom
				// Col C: Heure
				// Col D: Coeff
				f.SetCellStr(sheetName, fmt.Sprintf("B%d", rowIdx), m.Name)
				f.SetCellFloat(sheetName, fmt.Sprintf("C%d", rowIdx), float64(m.Heure), 2, 64)
				f.SetCellFloat(sheetName, fmt.Sprintf("D%d", rowIdx), float64(m.Coeff), 2, 64)
				rowIdx++
			}
		}
	}

	// 4. Envoi de la réponse
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"programme_%s.xlsx\"", option_.Name))

	if err := f.Write(w); err != nil {
		services.InternalServerError(w, r, "Erreur lors de l'écriture du fichier Excel", services.INTERNAL_ERROR, err)
	}
}
