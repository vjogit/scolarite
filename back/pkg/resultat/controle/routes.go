package controle

import (
	"context"
	"cyb-react/pkg/resultat/controle/gen"
	"cyb-react/pkg/services"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteControle(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	// Les contrôles (définitions d'épreuves) relèvent du domaine résultats.
	ecriture := services.RequireRole(services.RoleNotesEcriture)

	r.With(ecriture).Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreateControle(w, r)
	})

	r.Route("/{controleID}", func(r chi.Router) {
		r.With(lecture, ControleUse).Get("/", FetchControle)
		r.With(ecriture, ControleUse).Put("/", Update)
		r.With(ecriture).Delete("/", Delete)
	})

	r.With(lecture).Get("/", FetchControlesByMatiereID)
}

func ControleUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if controleID := chi.URLParam(r, "controleID"); controleID != "" {

			id, err := strconv.Atoi(controleID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			controle, err := queries.FetchControleById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Contrôle introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setControleFromCtx(r, &controle)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		services.InvalidRequestError(w, r, "pas d'id controle", services.MISSING_PARAM, nil)
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var ControleContextKey = &services.ContextKey{Name: "controle key"}

func getControleFromCtx(r *http.Request) *gen.FetchControleByIdRow {
	controle, ok := r.Context().Value(ControleContextKey).(*gen.FetchControleByIdRow)
	if ok {
		return controle
	}
	slog.Warn("contexte controle inconnu")
	return nil
}

func setControleFromCtx(r *http.Request, controle *gen.FetchControleByIdRow) context.Context {
	return context.WithValue(r.Context(), ControleContextKey, controle)
}
