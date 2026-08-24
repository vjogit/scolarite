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
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleStructureEcriture)

	r.With(ecriture).Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreatePeriode(w, r)
	})

	// Analyse d'impact, en lecture seule malgré le POST, appelée avant toute suppression.
	// Déclarée avant la route paramétrée pour ne pas être captée par {periodeID}.
	r.With(lecture).Post("/delete-impact", DeleteImpact)

	r.Route("/{periodeID}", func(r chi.Router) {
		r.With(lecture, PeriodeUse).Get("/", FetchPeriode)
		r.With(ecriture, PeriodeUse).Put("/", Update)
		r.With(ecriture).Delete("/", Delete)
	})

	r.With(lecture).Get("/", FetchPeriodesByOptionID)

}

func PeriodeUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if periodeID := chi.URLParam(r, "periodeID"); periodeID != "" {

			id, err := strconv.Atoi(periodeID)
			if err != nil {
				services.InvalidRequestError(w, r, "identifiant invalide", services.INVALID_PARAM, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			periode, err := queries.FetchPeriodeById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Periode introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.ServerError(w, r, err)
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

func getPeriodeFromCtx(r *http.Request) *gen.PeriodeActive {
	periode, ok := r.Context().Value(PeriodeContextKey).(*gen.PeriodeActive)
	if ok {
		return periode
	}
	slog.Warn("contexte periode inconnue")
	return nil
}

func setPeriodeFromCtx(r *http.Request, periode *gen.PeriodeActive) context.Context {
	return context.WithValue(r.Context(), PeriodeContextKey, periode)
}
