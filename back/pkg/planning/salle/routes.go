package salle

import (
	"context"
	"cyb-react/pkg/planning/salle/gen"
	"cyb-react/pkg/services"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteSalle(r chi.Router) {
	r.Post("/", CreateSalle)

	r.Route("/{salleID}", func(r chi.Router) {
		r.With(SalleUse).Get("/", FetchSalle)
		r.With(SalleUse).Put("/", Update)
		r.Delete("/", Delete)
	})

	r.Get("/", FetchAllSalle)
}

func SalleUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if salleID := chi.URLParam(r, "salleID"); salleID != "" {
			id, err := strconv.Atoi(salleID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			salle, err := queries.FetchSalleById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Salle introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setSalleFromCtx(r, &salle)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		services.InvalidRequestError(w, r, "pas d'id de salle", services.MISSING_PARAM, nil)
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var SalleContextKey = &services.ContextKey{Name: "salle key"}

func getSalleFromCtx(r *http.Request) *gen.Salle {
	salle, ok := r.Context().Value(SalleContextKey).(*gen.Salle)
	if ok {
		return salle
	}
	slog.Warn("contexte salle inconnu")
	return nil
}

func setSalleFromCtx(r *http.Request, salle *gen.Salle) context.Context {
	return context.WithValue(r.Context(), SalleContextKey, salle)
}
