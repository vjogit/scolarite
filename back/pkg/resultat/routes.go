package resultat

import (
	"cyb-react/pkg/resultat/controle"
	"cyb-react/pkg/resultat/jury"
	"cyb-react/pkg/resultat/note"

	"github.com/go-chi/chi/v5"
)

func RouteResultat(r chi.Router) {
	r.Route("/note", note.RouteNote)
	r.Route("/controle", controle.RouteControle)
	r.Route("/jury", jury.RouteJury)
}
