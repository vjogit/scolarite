package jury

import (
	"cyb-react/pkg/services"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func GetStatsJury(w http.ResponseWriter, r *http.Request) {

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
	juryService := NewJuryService(queries, int32(id))

	stats, err := juryService.PrepareJuryData(r.Context())
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)

}
