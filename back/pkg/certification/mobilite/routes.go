package mobilite

import (
	"context"
	"cyb-react/pkg/certification/mobilite/gen"
	"cyb-react/pkg/services"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteMobilite(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleCertificationEcriture)

	r.With(ecriture).Post("/", CreateMobilite)

	r.Route("/{mobiliteID}", func(r chi.Router) {
		r.With(lecture, MobiliteUse).Get("/", FetchMobilite)
		r.With(ecriture, MobiliteUse).Put("/", UpdateMobilite)
		r.With(ecriture).Delete("/", DeleteMobilite)
	})

	r.With(lecture).Get("/", FetchMobilitesByPromotionID)
}

func MobiliteUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mobiliteID := chi.URLParam(r, "mobiliteID")
		if mobiliteID == "" {
			services.InvalidRequestError(w, r, "pas d'id mobilite", services.MISSING_PARAM, nil)
			return
		}

		id, err := strconv.Atoi(mobiliteID)
		if err != nil {
			services.InvalidRequestError(w, r, "identifiant invalide", services.INVALID_PARAM, nil)
			return
		}

		queries := getQueriesFromCtx(r)
		mobilite, err := queries.FetchMobiliteById(context.Background(), int32(id))
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Mobilité introuvable", services.NOT_FOUND, nil)
			return
		}
		if err != nil {
			services.ServerError(w, r, err)
			return
		}

		ctx := setMobiliteFromCtx(r, &mobilite)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var MobiliteContextKey = &services.ContextKey{Name: "mobilite key"}

func getMobiliteFromCtx(r *http.Request) *gen.FetchMobiliteByIdRow {
	mobilite, ok := r.Context().Value(MobiliteContextKey).(*gen.FetchMobiliteByIdRow)
	if ok {
		return mobilite
	}
	slog.Warn("contexte mobilite inconnu")
	return nil
}

func setMobiliteFromCtx(r *http.Request, mobilite *gen.FetchMobiliteByIdRow) context.Context {
	return context.WithValue(r.Context(), MobiliteContextKey, mobilite)
}
