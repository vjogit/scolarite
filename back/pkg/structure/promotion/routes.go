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
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleStructureEcriture)

	r.With(ecriture).Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreatePromotion(w, r)
	})

	// Analyse d'impact, en lecture seule malgré le POST, appelée avant toute suppression.
	// Déclarée avant la route paramétrée pour ne pas être captée par {promotionID}.
	r.With(lecture).Post("/delete-impact", DeleteImpact)

	r.Route("/{promotionID}", func(r chi.Router) {
		r.With(lecture, PromotionUse).Get("/", FetchPromotion)
		r.With(ecriture, PromotionUse).Put("/", Update)
		r.With(ecriture).Delete("/", Delete)
	})

	r.With(lecture).Get("/", FetchPromotionsByFormationID)

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

func getPromotionFromCtx(r *http.Request) *gen.PromotionActive {
	promotion, ok := r.Context().Value(PromotionContextKey).(*gen.PromotionActive)
	if ok {
		return promotion
	}
	slog.Warn("contexte promotion inconnue")
	return nil
}

func setPromotionFromCtx(r *http.Request, promotion *gen.PromotionActive) context.Context {
	return context.WithValue(r.Context(), PromotionContextKey, promotion)
}
