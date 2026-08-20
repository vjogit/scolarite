package unite_enseignement

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/unite_enseignement/gen"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteUniteEnseignement(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleStructureEcriture)

	r.With(ecriture).Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreateUniteEnseignement(w, r)
	})

	r.Route("/{ueID}", func(r chi.Router) {
		r.With(lecture, UniteEnseignementUse).Get("/", FetchUniteEnseignement)
		r.With(ecriture, UniteEnseignementUse).Put("/", Update)
		r.With(ecriture).Delete("/", Delete)
	})

	r.With(lecture).Get("/", FetchUniteEnseignementsByPeriodeID)

}

func UniteEnseignementUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if ueID := chi.URLParam(r, "ueID"); ueID != "" {

			id, err := strconv.Atoi(ueID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			ue, err := queries.FetchUniteEnseignementById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "UniteEnseignement introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setUniteEnseignementFromCtx(r, &ue)
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

var UniteEnseignementContextKey = &services.ContextKey{Name: "ue key"}

func getUniteEnseignementFromCtx(r *http.Request) *gen.UniteEnseignement {
	ue, ok := r.Context().Value(UniteEnseignementContextKey).(*gen.UniteEnseignement)
	if ok {
		return ue
	}
	slog.Warn("contexte ue inconnue")
	return nil
}

func setUniteEnseignementFromCtx(r *http.Request, ue *gen.UniteEnseignement) context.Context {
	return context.WithValue(r.Context(), UniteEnseignementContextKey, ue)
}
