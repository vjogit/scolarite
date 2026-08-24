package toeic

import (
	"context"
	"cyb-react/pkg/certification/toeic/gen"
	"cyb-react/pkg/services"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteToeic(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleCertificationEcriture)

	r.With(ecriture).Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreateToeic(w, r)
	})

	r.Route("/{toeicID}", func(r chi.Router) {
		r.With(lecture, ToeicUse).Get("/", FetchToeic)
		r.With(ecriture, ToeicUse).Put("/", Update)
		r.With(ecriture).Delete("/", Delete)
	})

	r.With(lecture).Get("/", FetchToeicsByPromotionID)
}

func ToeicUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if toeicID := chi.URLParam(r, "toeicID"); toeicID != "" {

			id, err := strconv.Atoi(toeicID)
			if err != nil {
				services.InvalidRequestError(w, r, "identifiant invalide", services.INVALID_PARAM, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			toeic, err := queries.FetchToeicById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Contrôle introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.ServerError(w, r, err)
				return
			}

			ctx := setToeicFromCtx(r, &toeic)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		services.InvalidRequestError(w, r, "pas d'id toeic", services.MISSING_PARAM, nil)
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var ToeicContextKey = &services.ContextKey{Name: "toeic key"}

func getToeicFromCtx(r *http.Request) *gen.FetchToeicByIdRow {
	toeic, ok := r.Context().Value(ToeicContextKey).(*gen.FetchToeicByIdRow)
	if ok {
		return toeic
	}
	slog.Warn("contexte toeic inconnu")
	return nil
}

func setToeicFromCtx(r *http.Request, toeic *gen.FetchToeicByIdRow) context.Context {
	return context.WithValue(r.Context(), ToeicContextKey, toeic)
}
