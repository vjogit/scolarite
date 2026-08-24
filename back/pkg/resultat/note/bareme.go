package note

import (
	"context"
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"strconv"
)

// Le barème vit sur promotion, à côté des échelles qui sont déjà exprimées dans
// l'unité des notes. Une contrainte CHECK sur note ne peut pas le lire —
// PostgreSQL interdit les sous-requêtes dans un CHECK — la borne réelle est
// donc appliquée ici, la base ne conservant qu'un plafond d'absurdité
// (chk_note_max_absolu) contre les écritures qui contourneraient l'application.

// formatDecimal rend un réel sans décimale superflue : « 20 » et non
// « 20.00 », pour que les valeurs transportées restent lisibles telles quelles.
func formatDecimal(valeur float32) string {
	return strconv.FormatFloat(float64(valeur), 'f', -1, 32)
}

// noteHorsBareme vérifie 0 ≤ note ≤ bareme. Le mot qui accompagne le refus vit
// dans errorMessages.ts, avec la borne transportée en donnée (Max) — la saisie
// unitaire et l'import partagent ainsi la même formulation sans la posséder.
//
// Une note absente reste valide : c'est le cas « non évalué », où l'absence de
// valeur est l'information elle-même et non une valeur hors barème.
func noteHorsBareme(note *float32, bareme float32) bool {
	if note == nil {
		return false
	}
	return *note < 0 || *note > bareme
}

// fetchBareme remonte la chaîne controle → matiere → ue → periode → option →
// promotion. Appelé une fois par écriture, et une seule fois par import.
func fetchBareme(ctx context.Context, queries *gen.Queries, controleID int32) (float32, error) {
	return queries.FetchBaremeByControleID(ctx, controleID)
}

// noteFieldError construit la charge utile attendue par le formulaire : le
// front route errors.<champ> vers setError via fieldErrorsFor, et lit Max
// pour composer « entre 0 et N ».
func noteFieldError(bareme float32) map[string]any {
	return map[string]any{
		"errors": map[string]services.ConstraintError{
			"note": {Motif: services.MotifNoteHorsBareme, Max: &bareme},
		},
	}
}
