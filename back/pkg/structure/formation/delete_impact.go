package formation

import (
	"cyb-react/pkg/services"
	"fmt"
	"net/http"

	"github.com/go-chi/render"
)

// DeleteImpact analyse, sans rien modifier, ce qu'entraînerait la suppression
// des formations dont les identifiants sont fournis : objets visés, décomptes
// des descendants supprimés en cascade, objets seulement détachés, et raisons
// éventuelles de blocage.
func DeleteImpact(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête invalide", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	names, err := queries.FetchFormationNamesByIds(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : lecture des formations impossible (ids %v): %w", input.IDs, err))
		return
	}

	impact, err := queries.FormationDeleteImpact(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : comptage des formations impossible (ids %v): %w", input.IDs, err))
		return
	}

	resp := services.NewDeleteImpactResponse()
	for _, n := range names {
		resp.Items = append(resp.Items, services.DeleteImpactItem{ID: n.ID, Name: n.Name})
	}

	// L'ordre des appels porte la hiérarchie affichée par le front.
	resp.AddCascade("promotion", impact.PromotionCount)
	resp.AddCascade("toeic", impact.ToeicCount)
	resp.AddCascade("mobilite_internationale", impact.MobiliteCount)
	resp.AddCascade("option", impact.OptionCount)
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
