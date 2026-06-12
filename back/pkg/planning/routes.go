package planning

import (
	"cyb-react/pkg/planning/reservation"
	"cyb-react/pkg/planning/salle"

	"github.com/go-chi/chi/v5"
)

func RoutePlanning(r chi.Router) {
	r.Route("/salle", salle.RouteSalle)
	r.Route("/reservation", reservation.RouteReservation)
}
