package registre

import (
	"cyb-react/pkg/registre/gen"
	"cyb-react/pkg/services"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
)

func RouteRegistre(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)

	// Vérification d'intégrité : recalcul de toute la chaîne. Une chaîne
	// brisée est un résultat, pas une erreur HTTP — l'écran doit l'afficher.
	r.With(lecture).Get("/verification", verifierChaine)

	// Droit d'accès (art. 15 RGPD) : tous les maillons portant un élève.
	r.With(lecture).Get("/eleve", extraireMaillonsEleve)
}

func verifierChaine(w http.ResponseWriter, r *http.Request) {
	pgCtx := services.GetPgCtx(r.Context())
	res, err := VerifierChaine(r.Context(), pgCtx.Db)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	render.JSON(w, r, res)
}

func extraireMaillonsEleve(w http.ResponseWriter, r *http.Request) {
	uIDStr := r.URL.Query().Get("user_id")
	if uIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: user_id", services.MISSING_PARAM, nil)
		return
	}
	uID, err := strconv.Atoi(uIDStr)
	if err != nil || uID <= 0 {
		services.InvalidRequestError(w, r, "user_id invalide", services.INVALID_PARAM, nil)
		return
	}

	pgCtx := services.GetPgCtx(r.Context())
	maillons, err := gen.New(pgCtx.Db).ListMaillonsByUser(r.Context(), int32(uID))
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if maillons == nil {
		maillons = []gen.Registre{}
	}
	render.JSON(w, r, maillons)
}
