package user

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/user/gen"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteUser(r chi.Router, cfg *services.KeycloakConfig) {
	// La lecture reste ouverte à CONSULTATION : elle alimente les sélecteurs
	// d'élèves dans toute l'application (grille de saisie comprise).
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleUtilisateursEcriture)

	r.With(ecriture).Post("/", func(w http.ResponseWriter, r *http.Request) {
		CreateUser(w, r, cfg)
	})

	r.With(ecriture).Post("/import", func(w http.ResponseWriter, r *http.Request) {
		ImportUsers(w, r, cfg)
	})

	r.Route("/{userID}", func(r chi.Router) {
		r.With(lecture, UserUse).Get("/", func(w http.ResponseWriter, r *http.Request) {
			FetchUser(w, r, cfg)
		})
		r.With(ecriture, UserUse).Put("/", func(w http.ResponseWriter, r *http.Request) {
			Update(w, r, cfg)
		})
		r.With(ecriture).Delete("/", func(w http.ResponseWriter, r *http.Request) {
			Delete(w, r, cfg)
		})
	})

	r.With(lecture).Get("/", FetchAllUser)
	r.With(lecture).Get("/search", SearchUsers)
}

func UserUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if userID := chi.URLParam(r, "userID"); userID != "" {

			id, err := strconv.Atoi(userID)
			if err != nil {
				services.InvalidRequestError(w, r, "identifiant invalide", services.INVALID_PARAM, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			user, err := queries.FetchUserById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "User introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.ServerError(w, r, err)
				return
			}

			ctx := setUserFromCtx(r, &user)
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

var UserContextKey = &services.ContextKey{Name: "user key"}

func getUserFromCtx(r *http.Request) *gen.User {
	user, ok := r.Context().Value(UserContextKey).(*gen.User)
	if ok {
		return user
	}
	slog.Warn("contexte user inconnue")
	return nil
}

func setUserFromCtx(r *http.Request, user *gen.User) context.Context {
	return context.WithValue(r.Context(), UserContextKey, user)
}
