package jury

import (
	"cyb-react/pkg/services"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/xuri/excelize/v2"
)

func GenerateJury(w http.ResponseWriter, r *http.Request) {

	var periodeID string

	if periodeID = chi.URLParam(r, "periodeID"); periodeID == "" {
		services.InvalidRequestError(w, r, "pas d'id de periode", services.MISSING_PARAM, nil)
		return
	}

	id, err := strconv.Atoi(periodeID)
	if err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	s := NewJuryService(queries, int32(id))

	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Printf("Erreur lors de la fermeture du fichier: %v\n", err)
		}
	}()

	err = s.GenerateJury(f)
	if err != nil {
		services.InternalServerError(w, r, "Erreur lors de la génération du fichier Excel", services.INTERNAL_ERROR, err)
		return
	}

	// 4. Envoi de la réponse
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"jury_%s.xlsx\"", periodeID))

	if err := f.Write(w); err != nil {
		services.InternalServerError(w, r, "Erreur lors de l'écriture du fichier Excel", services.INTERNAL_ERROR, err)
		return
	}
}
