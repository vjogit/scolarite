package certification

import (
	mobilite "cyb-react/pkg/certification/mobilite"
	"cyb-react/pkg/certification/toeic"

	"github.com/go-chi/chi/v5"
)

func RouteToeic(r chi.Router) {
	r.Route("/toeic", toeic.RouteToeic)
	r.Route("/mobilite-internationale", mobilite.RouteMobilite)
}
