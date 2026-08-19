package services

import "strconv"

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
// Entity est l'identifiant technique (nom de table), Label le libellé français
// déjà accordé en nombre.
type DeleteImpactEntry struct {
	Entity string `json:"entity"`
	Label  string `json:"label"`
	Count  int64  `json:"count"`
}

// DeleteImpactBlocking décrit une raison métier interdisant la suppression.
type DeleteImpactBlocking struct {
	Reason  string `json:"reason"`
	Message string `json:"message"`
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

// entityLabels donne, pour chaque entité supprimable en cascade, son libellé
// français au singulier puis au pluriel. Centralisé ici pour que les quatre
// endpoints delete-impact parlent le même vocabulaire.
var entityLabels = map[string][2]string{
	"promotion":               {"promotion", "promotions"},
	"toeic":                   {"résultat TOEIC", "résultats TOEIC"},
	"mobilite_internationale": {"mobilité internationale", "mobilités internationales"},
	"option":                  {"option", "options"},
	"groupe":                  {"groupe", "groupes"},
	"groupe_user":             {"affectation d'élève à un groupe", "affectations d'élèves aux groupes"},
	"periode":                 {"période", "périodes"},
	"unite_enseignement":      {"unité d'enseignement", "unités d'enseignement"},
	"matiere":                 {"matière", "matières"},
	"controle":                {"contrôle", "contrôles"},
	"note":                    {"note", "notes"},
	"reservation":             {"réservation", "réservations"},
	"reservation_intervenant": {"affectation d'intervenant", "affectations d'intervenants"},
	"reservation_salle":       {"réservation de salle", "réservations de salle"},
	"reservation_groupe":      {"affectation de groupe à un créneau", "affectations de groupes aux créneaux"},
	"jury_result":             {"résultat de jury", "résultats de jury"},
}

// detachedLabels donne les libellés des objets qui ne sont pas supprimés mais
// dont la référence est mise à NULL (ON DELETE SET NULL).
var detachedLabels = map[string][2]string{
	"reservation": {"réservation détachée de sa matière", "réservations détachées de leur matière"},
}

func labelFor(labels map[string][2]string, entity string, count int64) string {
	if l, ok := labels[entity]; ok {
		return Pluralize(count, l[0], l[1])
	}
	return entity
}

// AddCascade ajoute un décompte de suppression en cascade, uniquement s'il est
// strictement positif. L'ordre des appels porte la hiérarchie.
func (r *DeleteImpactResponse) AddCascade(entity string, count int64) {
	if count <= 0 {
		return
	}
	r.Cascade = append(r.Cascade, DeleteImpactEntry{
		Entity: entity,
		Label:  labelFor(entityLabels, entity, count),
		Count:  count,
	})
}

// AddDetached ajoute un décompte d'objets qui ne sont pas supprimés mais dont
// la référence est mise à NULL (ON DELETE SET NULL).
func (r *DeleteImpactResponse) AddDetached(entity string, count int64) {
	if count <= 0 {
		return
	}
	r.Detached = append(r.Detached, DeleteImpactEntry{
		Entity: entity,
		Label:  labelFor(detachedLabels, entity, count),
		Count:  count,
	})
}

// AddBlocking ajoute une raison de blocage.
func (r *DeleteImpactResponse) AddBlocking(reason, message string) {
	r.Blocking = append(r.Blocking, DeleteImpactBlocking{Reason: reason, Message: message})
}

// Pluralize choisit le libellé accordé au nombre (0 et 1 au singulier).
func Pluralize(count int64, singulier, pluriel string) string {
	if count > 1 || count < -1 {
		return pluriel
	}
	return singulier
}

// ReasonJuryDelibere est le code de blocage renvoyé lorsqu'au moins une période
// concernée possède des résultats de jury (délibération déjà passée).
const ReasonJuryDelibere = "jury_delibere"

// JuryDelibereMessage construit le message de blocage associé.
func JuryDelibereMessage(nbPeriodes int64) string {
	if nbPeriodes > 1 {
		return "Suppression impossible : " + strconv.FormatInt(nbPeriodes, 10) + " périodes ont un jury délibéré."
	}
	return "Suppression impossible : 1 période a un jury délibéré."
}
