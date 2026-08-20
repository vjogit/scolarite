package formation

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/formation/gen"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteFormation(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleStructureEcriture)

	r.With(ecriture).Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreateFormation(w, r)
	})

	// Analyse d'impact, en lecture seule malgré le POST, appelée avant toute suppression.
	// Déclarée avant la route paramétrée pour ne pas être captée par {formationID}.
	r.With(lecture).Post("/delete-impact", DeleteImpact)

	r.Route("/{formationID}", func(r chi.Router) {
		r.With(lecture, FormationUse).Get("/", FetchFormation)
		r.With(ecriture, FormationUse).Put("/", Update)
		r.With(ecriture).Delete("/", Delete)
	})

	r.With(lecture).Get("/", FetchAllFormation)

}

func FormationUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if formationID := chi.URLParam(r, "formationID"); formationID != "" {

			id, err := strconv.Atoi(formationID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			formation, err := queries.FetchFormationById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Formation introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setFormationFromCtx(r, &formation)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		services.InvalidRequestError(w, r, "pas d'id utilisateur", services.MISSING_PARAM, nil)
	})
}

// remplace par une var car  les test unitaires surcharge la methode.
var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var FormationContextKey = &services.ContextKey{Name: "formation key"}

func getFormationFromCtx(r *http.Request) *gen.FormationActive {
	formation, ok := r.Context().Value(FormationContextKey).(*gen.FormationActive)
	if ok {
		return formation
	}
	slog.Warn("contexte formation inconnue")
	return nil
}

func setFormationFromCtx(r *http.Request, formation *gen.FormationActive) context.Context {
	return context.WithValue(r.Context(), FormationContextKey, formation)
}
