package groupe

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/groupe/gen"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteGroupe(r chi.Router) {
	r.Post("/", CreateGroupe)
	r.Get("/", FetchGroupesByOptionID)
	r.Post("/import-multi", ImportMultiGroupes)

	r.Route("/{groupeID}", func(r chi.Router) {
		r.With(GroupeUse).Get("/", FetchGroupe)
		r.With(GroupeUse).Put("/", UpdateGroupe)
		r.Delete("/", DeleteGroupe)

		r.With(GroupeUse).Get("/user", FetchUsersInGroupe)
		r.With(GroupeUse).Post("/user", AddUserToGroupe)
		r.With(GroupeUse).Delete("/user/{userID}", RemoveUserFromGroupe)
		r.With(GroupeUse).Post("/import", ImportOneGroupe)
	})
}

func GroupeUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		groupeIDStr := chi.URLParam(r, "groupeID")
		if groupeIDStr == "" {
			services.InvalidRequestError(w, r, "groupeID manquant", services.MISSING_PARAM, nil)
			return
		}

		id, err := strconv.Atoi(groupeIDStr)
		if err != nil {
			services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
			return
		}

		queries := getQueriesFromCtx(r)
		groupe, err := queries.FetchGroupeById(context.Background(), int32(id))
		if err == pgx.ErrNoRows {
			services.InvalidRequestError(w, r, "Groupe introuvable", services.NOT_FOUND, nil)
			return
		}
		if err != nil {
			services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
			return
		}

		ctx := setGroupeInCtx(r, &groupe)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var groupeContextKey = &services.ContextKey{Name: "groupe key"}

func GetGroupeFromCtx(r *http.Request) *gen.Groupe {
	groupe, ok := r.Context().Value(groupeContextKey).(*gen.Groupe)
	if ok {
		return groupe
	}
	slog.Warn("contexte groupe inconnu")
	return nil
}

func setGroupeInCtx(r *http.Request, groupe *gen.Groupe) context.Context {
	return context.WithValue(r.Context(), groupeContextKey, groupe)
}

func getUserIDFromPath(r *http.Request) string {
	return chi.URLParam(r, "userID")
}
