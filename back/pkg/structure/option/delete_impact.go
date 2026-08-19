package option

import (
	"cyb-react/pkg/services"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
)

// DeleteImpact analyse, sans rien modifier, ce qu'entraînerait la suppression
// des options dont les identifiants sont fournis : objets visés, décomptes
// des descendants supprimés en cascade, objets seulement détachés, et raisons
// éventuelles de blocage.
func DeleteImpact(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête invalide", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	names, err := queries.FetchOptionNamesByIds(r.Context(), input.IDs)
	if err != nil {
		slog.Error("impact de suppression : lecture des options impossible", "ids", input.IDs, "error", err)
		services.InternalServerError(w, r, "Impossible d'évaluer l'impact de la suppression", services.INTERNAL_ERROR, nil)
		return
	}

	impact, err := queries.OptionDeleteImpact(r.Context(), input.IDs)
	if err != nil {
		slog.Error("impact de suppression : comptage des options impossible", "ids", input.IDs, "error", err)
		services.InternalServerError(w, r, "Impossible d'évaluer l'impact de la suppression", services.INTERNAL_ERROR, nil)
		return
	}

	resp := services.NewDeleteImpactResponse()
	for _, n := range names {
		resp.Items = append(resp.Items, services.DeleteImpactItem{ID: n.ID, Name: n.Name})
	}

	// L'ordre des appels porte la hiérarchie affichée par le front.
	resp.AddCascade("groupe", impact.GroupeCount)
	resp.AddCascade("groupe_user", impact.GroupeUserCount)
	resp.AddCascade("periode", impact.PeriodeCount)
	resp.AddCascade("unite_enseignement", impact.UeCount)
	resp.AddCascade("matiere", impact.MatiereCount)
	resp.AddCascade("controle", impact.ControleCount)
	resp.AddCascade("note", impact.NoteCount)
	resp.AddCascade("reservation", impact.ReservationCount)
	resp.AddCascade("reservation_intervenant", impact.ReservationIntervenantCount)
	resp.AddCascade("reservation_salle", impact.ReservationSalleCount)
	resp.AddCascade("reservation_groupe", impact.ReservationGroupeCount)
	resp.AddCascade("jury_result", impact.JuryResultCount)

	resp.AddDetached("reservation", impact.ReservationDetacheeCount)

	if impact.JuryPeriodeCount > 0 {
		resp.AddBlocking(services.ReasonJuryDelibere, services.JuryDelibereMessage(impact.JuryPeriodeCount))
	}

	render.JSON(w, r, resp)
}
