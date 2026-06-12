package promotion

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/promotion/gen"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RoutePromotion(r chi.Router) {

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreatePromotion(w, r)
	})

	r.Route("/{promotionID}", func(r chi.Router) {
		r.With(PromotionUse).Get("/", FetchPromotion)
		r.With(PromotionUse).Put("/", Update)
		r.Delete("/", Delete)
	})

	r.Get("/", FetchPromotionsByFormationID)

}

func PromotionUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if promotionID := chi.URLParam(r, "promotionID"); promotionID != "" {

			id, err := strconv.Atoi(promotionID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			promotion, err := queries.FetchPromotionById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Promotion introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setPromotionFromCtx(r, &promotion)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		services.InvalidRequestError(w, r, "pas d'id promotion", services.MISSING_PARAM, nil)
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var PromotionContextKey = &services.ContextKey{Name: "promotion key"}

func getPromotionFromCtx(r *http.Request) *gen.Promotion {
	promotion, ok := r.Context().Value(PromotionContextKey).(*gen.Promotion)
	if ok {
		return promotion
	}
	slog.Warn("contexte promotion inconnue")
	return nil
}

func setPromotionFromCtx(r *http.Request, promotion *gen.Promotion) context.Context {
	return context.WithValue(r.Context(), PromotionContextKey, promotion)
}
