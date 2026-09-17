package matiere

import (
	"cyb-react/pkg/resultat/jury"
	"cyb-react/pkg/services"
	"fmt"
	"net/http"

	"github.com/go-chi/render"
)

// DeleteImpact analyse, sans rien modifier, ce qu'entraînerait la suppression
// des matières dont les identifiants sont fournis : objets visés, décomptes
// des descendants supprimés en cascade, objets seulement détachés.
// Suppression physique (pas de corbeille), aucune raison de blocage.
func DeleteImpact(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête invalide", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	names, err := queries.FetchMatiereNamesByIds(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : lecture des matières impossible (ids %v): %w", input.IDs, err))
		return
	}

	impact, err := queries.MatiereDeleteImpact(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : comptage des matières impossible (ids %v): %w", input.IDs, err))
		return
	}

	resp := services.NewDeleteImpactResponse()
	for _, n := range names {
		resp.Items = append(resp.Items, services.DeleteImpactItem{ID: n.ID, Name: n.Name})
	}

	// L'ordre des appels porte la hiérarchie affichée par le front.
	resp.AddCascade("syllabus_matiere", impact.SyllabusMatiereCount)
	resp.AddCascade("controle", impact.ControleCount)
	resp.AddCascade("note", impact.NoteCount)

	resp.AddDetached("reservation", impact.ReservationDetacheeCount)

	// Blocage : le même contrôle que le DELETE, pour que la modale annonce
	// exactement ce que le serveur fera respecter (lot correction-blocage-jury).
	nbPeriodesDeliberees, err := jury.CountPeriodesDeliberees(r.Context(), services.GetPgCtx(r.Context()).Db, jury.PerimetreMatiere, input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : contrôle du jury impossible (ids %v): %w", input.IDs, err))
		return
	}
	if nbPeriodesDeliberees > 0 {
		resp.AddBlocking(services.ReasonJuryDelibere, nbPeriodesDeliberees)
	}

	render.JSON(w, r, resp)
}
