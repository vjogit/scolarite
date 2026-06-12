package reservation

import (
	"cyb-react/pkg/planning/reservation/gen"
	"cyb-react/pkg/services"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
)

func FetchHeuresByPeriode(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("periode_id")
	periodeID, err := strconv.Atoi(raw)
	if err != nil || periodeID == 0 {
		services.InvalidRequestError(w, r, "periode_id invalide", services.INVALID_PARAM, nil)
		return
	}

	var rows []gen.FetchHeuresByPeriodeRow

	queries := getQueriesFromCtx(r)
	rows, err = queries.FetchHeuresByPeriode(r.Context(), int32(periodeID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	render.JSON(w, r, rows)
}
