package services

import (
	"net/http"
	"strconv"
)

// Types de réponse partagés par les endpoints d'analyse d'impact de suppression
// (POST .../delete-impact). Ils décrivent, avant toute suppression, ce qui sera
// détruit en cascade, ce qui sera seulement détaché, et ce qui interdit la
// suppression.

// DeleteImpactItem identifie un objet directement visé par la suppression.
type DeleteImpactItem struct {
	ID   int32  `json:"id"`
	Name string `json:"name"`
}

// DeleteImpactEntry est un décompte de descendants pour une entité donnée.
// Entity est la clé stable (nom de table) que le front traduit et accorde en
// nombre (bloc `impact` de crud.json, fr et en) : le serveur ne compose aucun
// libellé — convention du 17 septembre 2026, lot correction-langue. Une clé
// nouvelle ici s'ajoute dans les deux JSON, sinon l'écran affiche la clé brute.
// Clés servies : promotion, toeic, mobilite_internationale, option, groupe,
// groupe_user, periode, unite_enseignement, matiere, controle, note,
// reservation, reservation_intervenant, reservation_salle, reservation_groupe,
// jury_result, bloc_competence, competence, ue_competence, syllabus_matiere
// (cascade) ; reservation (détaché, clé `impact.detache.reservation`).
type DeleteImpactEntry struct {
	Entity string `json:"entity"`
	Count  int64  `json:"count"`
}

// DeleteImpactBlocking décrit une raison métier interdisant la suppression :
// un code (`blocage.<reason>` d'errors.json) et le nombre qui l'accorde —
// pour jury_delibere, le nombre de périodes délibérées.
type DeleteImpactBlocking struct {
	Reason string `json:"reason"`
	Count  int64  `json:"count"`
}

// DeleteImpactResponse est le corps renvoyé par les endpoints delete-impact.
type DeleteImpactResponse struct {
	Items    []DeleteImpactItem     `json:"items"`
	Cascade  []DeleteImpactEntry    `json:"cascade"`
	Detached []DeleteImpactEntry    `json:"detached"`
	Blocking []DeleteImpactBlocking `json:"blocking"`
}

// NewDeleteImpactResponse retourne une réponse avec des slices non nulles :
// le front reçoit ainsi [] et non null.
func NewDeleteImpactResponse() *DeleteImpactResponse {
	return &DeleteImpactResponse{
		Items:    []DeleteImpactItem{},
		Cascade:  []DeleteImpactEntry{},
		Detached: []DeleteImpactEntry{},
		Blocking: []DeleteImpactBlocking{},
	}
}

// AddCascade ajoute un décompte de suppression en cascade, uniquement s'il est
// strictement positif. L'ordre des appels porte la hiérarchie.
func (r *DeleteImpactResponse) AddCascade(entity string, count int64) {
	if count <= 0 {
		return
	}
	r.Cascade = append(r.Cascade, DeleteImpactEntry{Entity: entity, Count: count})
}

// AddDetached ajoute un décompte d'objets qui ne sont pas supprimés mais dont
// la référence est mise à NULL (ON DELETE SET NULL).
func (r *DeleteImpactResponse) AddDetached(entity string, count int64) {
	if count <= 0 {
		return
	}
	r.Detached = append(r.Detached, DeleteImpactEntry{Entity: entity, Count: count})
}

// AddBlocking ajoute une raison de blocage, accordée par son nombre.
func (r *DeleteImpactResponse) AddBlocking(reason string, count int64) {
	r.Blocking = append(r.Blocking, DeleteImpactBlocking{Reason: reason, Count: count})
}

// ReasonJuryDelibere est le code de blocage renvoyé lorsqu'au moins une période
// concernée possède des résultats de jury (délibération déjà passée).
const ReasonJuryDelibere = "jury_delibere"

// ConflictJuryDelibere refuse une suppression ou une purge en 409 : la raison
// et le nombre de périodes délibérées partent en extensions, c'est le front
// qui rédige (`blocage.jury_delibere`, errors.json). Le `detail` n'est qu'un
// repli technique pour un client qui ne connaît pas la raison.
func ConflictJuryDelibere(w http.ResponseWriter, r *http.Request, nbPeriodes int64) {
	ConflictError(w, r, "Suppression refusée : "+strconv.FormatInt(nbPeriodes, 10)+" période(s) à jury délibéré.",
		BUSINESS_CONFLICT, map[string]any{"reason": ReasonJuryDelibere, "count": nbPeriodes})
}
