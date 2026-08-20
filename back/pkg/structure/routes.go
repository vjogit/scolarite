package structure

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/exchange"
	"cyb-react/pkg/structure/formation"
	"cyb-react/pkg/structure/groupe"
	"cyb-react/pkg/structure/matiere"
	"cyb-react/pkg/structure/option"
	"cyb-react/pkg/structure/periode"
	"cyb-react/pkg/structure/promotion"
	"cyb-react/pkg/structure/unite_enseignement"

	"github.com/go-chi/chi/v5"
)

func RouteStructure(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleStructureEcriture)

	// Routes transverses (Import/Export) définies ici pour éviter les cycles d'import.
	// L'export est une lecture malgré son contenu volumineux ; l'import écrit la structure.
	r.With(ecriture, option.OptionUse).Post("/option/{optionID}/import", exchange.ImportPeriode)
	r.With(lecture, option.OptionUse).Get("/option/{optionID}/export", exchange.ExportPeriode)

	r.Route("/formation", formation.RouteFormation)
	r.Route("/promotion", promotion.RoutePromotion)
	r.Route("/option", option.RouteOption)
	r.Route("/periode", periode.RoutePeriode)
	r.Route("/ue", unite_enseignement.RouteUniteEnseignement)
	r.Route("/matiere", matiere.RouteMatiere)
	r.Route("/groupe", groupe.RouteGroupe)

}
