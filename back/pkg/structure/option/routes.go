package option

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/option/gen"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteOption(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleStructureEcriture)

	r.With(ecriture).Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreateOption(w, r)
	})

	// Analyse d'impact, en lecture seule malgré le POST, appelée avant toute suppression.
	// Déclarée avant la route paramétrée pour ne pas être captée par {optionID}.
	r.With(lecture).Post("/delete-impact", DeleteImpact)

	r.Route("/{optionID}", func(r chi.Router) {
		r.With(lecture, OptionUse).Get("/", FetchOption)
		r.With(ecriture, OptionUse).Put("/", Update)
		r.With(ecriture).Delete("/", Delete)
	})

	r.With(lecture).Get("/", FetchOptionsByPromotionID)

}

func OptionUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if optionID := chi.URLParam(r, "optionID"); optionID != "" {

			id, err := strconv.Atoi(optionID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			option, err := queries.FetchOptionById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Option introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setOptionFromCtx(r, &option)
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

var OptionContextKey = &services.ContextKey{Name: "option key"}

func GetOptionFromCtx(r *http.Request) *gen.OptionActive {
	option, ok := r.Context().Value(OptionContextKey).(*gen.OptionActive)
	if ok {
		return option
	}
	slog.Warn("contexte option inconnue")
	return nil
}

func setOptionFromCtx(r *http.Request, option *gen.OptionActive) context.Context {
	return context.WithValue(r.Context(), OptionContextKey, option)
}
