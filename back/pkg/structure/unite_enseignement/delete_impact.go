package unite_enseignement

import (
	"cyb-react/pkg/services"
	"fmt"
	"net/http"

	"github.com/go-chi/render"
)

// DeleteImpact analyse, sans rien modifier, ce qu'entraînerait la suppression
// des UE dont les identifiants sont fournis : objets visés, décomptes des
// descendants supprimés en cascade, objets seulement détachés. Suppression
// physique (pas de corbeille) ; aucune raison de blocage, le DELETE n'en
// connaît pas — les résultats de jury rattachés à l'UE sont comptés en
// cascade, pas retenus (défaut consigné dans CLAUDE.md, hors de ce lot).
func DeleteImpact(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête invalide", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	names, err := queries.FetchUeNamesByIds(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : lecture des UE impossible (ids %v): %w", input.IDs, err))
		return
	}

	impact, err := queries.UeDeleteImpact(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : comptage des UE impossible (ids %v): %w", input.IDs, err))
		return
	}

	resp := services.NewDeleteImpactResponse()
	for _, n := range names {
		resp.Items = append(resp.Items, services.DeleteImpactItem{ID: n.ID, Name: n.Name})
	}

	// L'ordre des appels porte la hiérarchie affichée par le front.
	resp.AddCascade("matiere", impact.MatiereCount)
	resp.AddCascade("syllabus_matiere", impact.SyllabusMatiereCount)
	resp.AddCascade("controle", impact.ControleCount)
	resp.AddCascade("note", impact.NoteCount)
	resp.AddCascade("jury_result", impact.JuryResultCount)
	resp.AddCascade("ue_competence", impact.UeCompetenceCount)

	resp.AddDetached("reservation", impact.ReservationDetacheeCount)

	render.JSON(w, r, resp)
}
