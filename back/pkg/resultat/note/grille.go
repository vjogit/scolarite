package note

import (
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// paramEntier lit un paramètre de requête obligatoire attendu entier et rend
// l'erreur au client lui-même. Le second retour dit si l'appelant peut
// continuer : une erreur a déjà été écrite dans le cas contraire.
func paramEntier(w http.ResponseWriter, r *http.Request, nom string) (int32, bool) {
	brut := r.URL.Query().Get(nom)
	if brut == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: "+nom, services.MISSING_PARAM, nil)
		return 0, false
	}
	valeur, err := strconv.Atoi(brut)
	if err != nil {
		services.InvalidRequestError(w, r, nom+" invalide", services.INVALID_PARAM, nil)
		return 0, false
	}
	return int32(valeur), true
}

// fetchGrille rend l'effectif d'un groupe pour un contrôle, chaque élève
// portant sa note si elle existe.
//
// C'est le renversement que la grille de saisie demande : les autres écrans de
// notes sont alimentés par les notes existantes, celui-ci l'est par l'effectif.
// Un élève sans note en ressort avec des champs de note nuls, pas absent.
func fetchGrille(w http.ResponseWriter, r *http.Request) {
	controleID, ok := paramEntier(w, r, "controle_id")
	if !ok {
		return
	}
	groupeID, ok := paramEntier(w, r, "groupe_id")
	if !ok {
		return
	}

	queries := getQueriesFromCtx(r)

	// Un contrôle inexistant et un groupe sans élève rendraient tous deux une
	// grille vide : on distingue les deux, l'un est une erreur d'adressage,
	// l'autre un effectif à constituer.
	if _, err := queries.CheckControleExists(r.Context(), controleID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Contrôle introuvable", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	lignes, err := queries.FetchGrilleControle(r.Context(), gen.FetchGrilleControleParams{
		ControleID: controleID,
		GroupeID:   groupeID,
	})
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if lignes == nil {
		lignes = []gen.FetchGrilleControleRow{}
	}

	render.JSON(w, r, lignes)
}
