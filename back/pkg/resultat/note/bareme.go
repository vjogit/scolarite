package note

import (
	"context"
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"fmt"
	"strconv"
)

// Le barème vit sur promotion, à côté des échelles qui sont déjà exprimées dans
// l'unité des notes. Une contrainte CHECK sur note ne peut pas le lire —
// PostgreSQL interdit les sous-requêtes dans un CHECK — la borne réelle est
// donc appliquée ici, la base ne conservant qu'un plafond d'absurdité
// (chk_note_max_absolu) contre les écritures qui contourneraient l'application.

// formatDecimal rend un réel sans décimale superflue : « 20 » et non
// « 20.00 », pour que les messages affichés à l'utilisateur restent lisibles.
func formatDecimal(valeur float32) string {
	return strconv.FormatFloat(float64(valeur), 'f', -1, 32)
}

// messageHorsBareme est le libellé unique de la borne, partagé par la saisie
// unitaire et l'import : deux formulations divergentes pour la même règle
// désorienteraient l'utilisateur qui passe de l'une à l'autre.
func messageHorsBareme(bareme float32) string {
	return fmt.Sprintf("La note doit être comprise entre 0 et %s", formatDecimal(bareme))
}

// validateNote vérifie 0 ≤ note ≤ bareme et retourne le message d'erreur, ou
// une chaîne vide si la note est acceptable.
//
// Une note absente reste valide : c'est le cas « non évalué », où l'absence de
// valeur est l'information elle-même et non une valeur hors barème.
func validateNote(note *float32, bareme float32) string {
	if note == nil {
		return ""
	}
	if *note < 0 || *note > bareme {
		return messageHorsBareme(bareme)
	}
	return ""
}

// fetchBareme remonte la chaîne controle → matiere → ue → periode → option →
// promotion. Appelé une fois par écriture, et une seule fois par import.
func fetchBareme(ctx context.Context, queries *gen.Queries, controleID int32) (float32, error) {
	return queries.FetchBaremeByControleID(ctx, controleID)
}

// noteFieldError construit la charge utile attendue par le formulaire : le
// front route details.errors.<champ> vers setError via fieldErrorsFor.
func noteFieldError(message string) map[string]interface{} {
	return map[string]interface{}{
		"errors": map[string]services.ConstraintError{
			"note": {Message: message},
		},
	}
}
