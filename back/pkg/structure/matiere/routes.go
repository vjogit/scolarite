package matiere

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/matiere/gen"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteMatiere(r chi.Router) {

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreateMatiere(w, r)
	})

	r.Route("/{matiereID}", func(r chi.Router) {
		r.With(MatiereUse).Get("/", FetchMatiere)
		r.With(MatiereUse).Put("/", Update)
		r.Delete("/", Delete)
	})

	r.Get("/", FetchMatieresByUniteEnseignementID)

}

func MatiereUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if matiereID := chi.URLParam(r, "matiereID"); matiereID != "" {

			id, err := strconv.Atoi(matiereID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			matiere, err := queries.FetchMatiereById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Matiere introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setMatiereFromCtx(r, &matiere)
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

var MatiereContextKey = &services.ContextKey{Name: "matiere key"}

func getMatiereFromCtx(r *http.Request) *gen.Matiere {
	matiere, ok := r.Context().Value(MatiereContextKey).(*gen.Matiere)
	if ok {
		return matiere
	}
	slog.Warn("contexte matiere inconnue")
	return nil
}

func setMatiereFromCtx(r *http.Request, matiere *gen.Matiere) context.Context {
	return context.WithValue(r.Context(), MatiereContextKey, matiere)
}
