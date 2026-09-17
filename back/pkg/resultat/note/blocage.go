package note

import (
	"cyb-react/pkg/resultat/jury"
	"cyb-react/pkg/services"
	"fmt"
	"net/http"
)

// La grille reste verrouillée tant que la délibération n'est pas annulée
// (17 septembre 2026) : `jury_result` est le relevé figé et les bulletins se
// régénèrent depuis les notes — une note modifiée après délibération
// changerait un document remis. Toute écriture de note (création, mise à
// jour, effacement, import de fiche) passe donc par ce contrôle avant
// d'ouvrir sa transaction, sur la même définition que les suppressions
// (jury.CountPeriodesDeliberees, périmètre contrôle) ; rien n'est écrit,
// aucun maillon n'est posé. Le geste légitime est l'annulation de la
// délibération (maillon jury.cancel), qui rouvre la grille.
//
// Renvoie true quand une réponse a été écrite : le handler s'arrête là.
func refuserSaisieSiJuryDelibere(w http.ResponseWriter, r *http.Request, controleIDs []int32) bool {
	if len(controleIDs) == 0 {
		return false
	}
	nb, err := jury.CountPeriodesDeliberees(r.Context(), services.GetPgCtx(r.Context()).Db, jury.PerimetreControle, controleIDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("saisie : contrôle du jury impossible (contrôles %v): %w", controleIDs, err))
		return true
	}
	if nb > 0 {
		services.ConflictSaisieApresDeliberation(w, r, nb)
		return true
	}
	return false
}
