package jury

import (
	"context"
	"cyb-react/pkg/resultat/jury/gen"
	"cyb-react/pkg/services"
	"fmt"
	"net/http"
)

// Perimetre nomme le type des identifiants qu'une suppression vise ; la
// requête CountPeriodesDeliberees en déduit les périodes que la cascade
// atteindrait.
type Perimetre string

const (
	PerimetreFormation Perimetre = "formation"
	PerimetrePromotion Perimetre = "promotion"
	PerimetreOption    Perimetre = "option"
	PerimetrePeriode   Perimetre = "periode"
	PerimetreUE        Perimetre = "unite_enseignement"
	PerimetreMatiere   Perimetre = "matiere"
	PerimetreControle  Perimetre = "controle"
)

// CountPeriodesDeliberees renvoie le nombre de périodes actives, délibérées
// (au moins un résultat de jury), que la suppression des entités désignées
// atteindrait — directement ou par cascade, vers le haut comme vers le bas.
// C'est l'unique définition du blocage « jury délibéré » : tout handler de
// suppression l'appelle avant d'écrire, et les analyses d'impact de l'UE et
// de la matière s'en servent pour annoncer le même refus.
func CountPeriodesDeliberees(ctx context.Context, db gen.DBTX, perimetre Perimetre, ids []int32) (int64, error) {
	return gen.New(db).CountPeriodesDeliberees(ctx, gen.CountPeriodesDelibereesParams{
		Perimetre: string(perimetre),
		Ids:       ids,
	})
}

// RefuserSiJuryDelibere fait le contrôle et, s'il mord, rend le 409 du régime
// commun (`reason: jury_delibere`, `count` = périodes délibérées touchées) ou
// un 500 si le contrôle échoue. Renvoie true quand une réponse a été écrite :
// le handler s'arrête là, rien n'a été modifié.
func RefuserSiJuryDelibere(w http.ResponseWriter, r *http.Request, perimetre Perimetre, ids []int32) bool {
	nb, err := CountPeriodesDeliberees(r.Context(), services.GetPgCtx(r.Context()).Db, perimetre, ids)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("suppression : contrôle du jury impossible (%s, ids %v): %w", perimetre, ids, err))
		return true
	}
	if nb > 0 {
		services.ConflictJuryDelibere(w, r, nb)
		return true
	}
	return false
}
