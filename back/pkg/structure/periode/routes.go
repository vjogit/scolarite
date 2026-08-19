package periode

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/periode/gen"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RoutePeriode(r chi.Router) {

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreatePeriode(w, r)
	})

	// Analyse d'impact, en lecture seule, appelée avant toute suppression.
	// Déclarée avant la route paramétrée pour ne pas être captée par {periodeID}.
	r.Post("/delete-impact", DeleteImpact)

	r.Route("/{periodeID}", func(r chi.Router) {
		r.With(PeriodeUse).Get("/", FetchPeriode)
		r.With(PeriodeUse).Put("/", Update)
		r.Delete("/", Delete)
	})

	r.Get("/", FetchPeriodesByOptionID)

}

func PeriodeUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if periodeID := chi.URLParam(r, "periodeID"); periodeID != "" {

			id, err := strconv.Atoi(periodeID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			periode, err := queries.FetchPeriodeById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Periode introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setPeriodeFromCtx(r, &periode)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		services.InvalidRequestError(w, r, "pas d'id utilisateur", services.MISSING_PARAM, nil)
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var PeriodeContextKey = &services.ContextKey{Name: "periode key"}

func getPeriodeFromCtx(r *http.Request) *gen.Periode {
	periode, ok := r.Context().Value(PeriodeContextKey).(*gen.Periode)
	if ok {
		return periode
	}
	slog.Warn("contexte periode inconnue")
	return nil
}

func setPeriodeFromCtx(r *http.Request, periode *gen.Periode) context.Context {
	return context.WithValue(r.Context(), PeriodeContextKey, periode)
}
