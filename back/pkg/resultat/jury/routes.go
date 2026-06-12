package jury

import (
	"cyb-react/pkg/resultat/jury/gen"
	"cyb-react/pkg/services"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func RouteJury(r chi.Router) {
	r.Get("/excel/{periodeID}", GenerateJury)
	r.Get("/data/{periodeID}", GetStatsJury)
	r.Post("/bulletins/{periodeID}", GenerateJuryBulletins)

	r.Route("/periode/{periodeID}/deliberer", func(r chi.Router) {
		r.Get("/", FetchDeliberations)
		r.Post("/bulk", DelibererBulk)
		r.Post("/{userID}", DelibererEleve)
		r.Delete("/{userID}", AnnulerDeliberation)
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}
