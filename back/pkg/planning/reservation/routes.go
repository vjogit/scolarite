package reservation

import (
	"context"
	"cyb-react/pkg/planning/reservation/gen"
	"cyb-react/pkg/services"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteReservation(r chi.Router) {

	r.Post("/", CreateReservation)

	r.Route("/{reservationID}", func(r chi.Router) {
		r.With(ReservationUse).Get("/", FetchReservation)
		r.With(ReservationUse).Put("/", Update)
		r.Delete("/", Delete)
	})

	r.Get("/", FetchReservationsByPeriode)
	r.Get("/heures", FetchHeuresByPeriode)
}

func ReservationUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if reservationID := chi.URLParam(r, "reservationID"); reservationID != "" {

			id, err := strconv.Atoi(reservationID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			reservation, err := queries.FetchReservationByID(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Réservation introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setReservationFromCtx(r, &reservation)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		services.InvalidRequestError(w, r, "pas d'id de réservation", services.MISSING_PARAM, nil)
	})
}

// remplace par une var car les tests unitaires surchargent la méthode.
var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var ReservationContextKey = &services.ContextKey{Name: "reservation key"}

func getReservationFromCtx(r *http.Request) *gen.FetchReservationByIDRow {
	reservation, ok := r.Context().Value(ReservationContextKey).(*gen.FetchReservationByIDRow)
	if ok {
		return reservation
	}
	slog.Warn("contexte reservation inconnu")
	return nil
}

func setReservationFromCtx(r *http.Request, reservation *gen.FetchReservationByIDRow) context.Context {
	return context.WithValue(r.Context(), ReservationContextKey, reservation)
}

// getPeriodeIDFromCtx extrait le periodeID depuis les query params de l'URL.
// Utilisé par FetchReservationsByPeriode.
var getPeriodeIDFromCtx = func(r *http.Request) int32 {
	raw := r.URL.Query().Get("periode_id")
	id, err := strconv.Atoi(raw)
	if err != nil {
		return 0
	}
	return int32(id)
}
