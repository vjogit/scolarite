package corbeille

import (
	"cyb-react/pkg/services"

	"github.com/go-chi/chi/v5"
)

// RouteCorbeille monte les trois gestes de la corbeille. Tout le préfixe
// exige les huit rôles fonctionnels — l'expression du composite ADMIN sans
// tester son nom : restaurer ou détruire une branche entière n'est pas un
// geste de gestion courante.
func RouteCorbeille(r chi.Router) {
	r.Use(services.RequireAllRoles(services.RolesFonctionnels...))

	r.Get("/", Lister)
	r.Post("/{opID}/restaurer", Restaurer)
	r.Delete("/{opID}", Purger)
}
