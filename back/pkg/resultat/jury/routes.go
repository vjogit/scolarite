package jury

import (
	"cyb-react/pkg/resultat/jury/gen"
	"cyb-react/pkg/services"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func RouteJury(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleJuryEcriture)

	r.With(lecture).Get("/excel/{periodeID}", GenerateJury)
	r.With(lecture).Get("/data/{periodeID}", GetStatsJury)
	// Génération d'un ZIP de bulletins : une lecture malgré le POST, rien n'est écrit en base.
	r.With(lecture).Post("/bulletins/{periodeID}", GenerateJuryBulletins)

	r.Route("/periode/{periodeID}/deliberer", func(r chi.Router) {
		// Consulter les délibérations est une lecture ; délibérer ou annuler, une écriture.
		r.With(lecture).Get("/", FetchDeliberations)
		r.With(ecriture).Post("/bulk", DelibererBulk)
		r.With(ecriture).Post("/{userID}", DelibererEleve)
		r.With(ecriture).Delete("/{userID}", AnnulerDeliberation)
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}
