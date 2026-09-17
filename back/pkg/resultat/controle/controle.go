package controle

import (
	"cyb-react/pkg/registre"
	"cyb-react/pkg/resultat/controle/gen"
	"cyb-react/pkg/resultat/jury"
	"cyb-react/pkg/services"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Controle"
var controleConstraints = map[string]services.ConstraintRule{
	"chk_controle_name_length":    {Field: "name", Motif: services.MotifChampObligatoire},
	"chk_controle_coeff_positive": {Field: "coeff", Motif: services.MotifValeurNegative},
	"fk_controles_matieres":       {Field: "matiere_id", Motif: services.MotifReferenceInconnue},
}

func CreateControle(w http.ResponseWriter, r *http.Request) {
	var input gen.Controle
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Note: Assurez-vous que gen.CreateControleParams inclut IsRattrapage
	id, err := queries.CreateControle(r.Context(), gen.CreateControleParams{
		Name:         input.Name,
		Coeff:        input.Coeff,
		IsRattrapage: input.IsRattrapage,
		Remarque:     input.Remarque,
		MatiereID:    input.MatiereID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, controleConstraints)

		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données du contrôle", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Contrôle créé", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)
}

// controleDetail : la ligne du contrôle, plus ce que seul le détail rapporte
// — comme le barème de la promotion. `jury_delibere` dit si la période du
// contrôle porte un jury délibéré : la grille de saisie s'y verrouille (le
// serveur refuse de toute façon, 409 saisie_apres_deliberation), et le front
// n'a aucune requête de plus à faire — la définition reste celle du domaine
// jury, pas une jointure recopiée ici.
type controleDetail struct {
	*gen.FetchControleByIdRow
	JuryDelibere bool `json:"jury_delibere"`
}

func FetchControle(w http.ResponseWriter, r *http.Request) {
	controle := getControleFromCtx(r)
	nb, err := jury.CountPeriodesDeliberees(r.Context(), services.GetPgCtx(r.Context()).Db, jury.PerimetreControle, []int32{controle.ID})
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	render.JSON(w, r, controleDetail{FetchControleByIdRow: controle, JuryDelibere: nb > 0})
}

func FetchControlesByMatiereID(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	var controles []gen.Controle
	var err error
	var fIDStr string

	if fIDStr = r.URL.Query().Get("matiere_id"); fIDStr == "" {
		services.InvalidRequestError(w, r, "matiere_id requis", services.MISSING_PARAM, nil)
		return
	}

	fID, errConv := strconv.Atoi(fIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "matiere_id invalide", services.INVALID_PARAM, nil)
		return
	}

	_, err = queries.CheckMatiereExists(r.Context(), int32(fID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Matière introuvable", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	controles, err = queries.FetchControlesByMatiereId(r.Context(), int32(fID))
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if controles == nil {
		controles = []gen.Controle{}
	}

	render.JSON(w, r, controles)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.Controle
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Note: Assurez-vous que gen.UpdateControleParams inclut IsRattrapage
	version, err := queries.UpdateControle(r.Context(), gen.UpdateControleParams{
		ID:           input.ID,
		Version:      input.Version,
		Name:         input.Name,
		Coeff:        input.Coeff,
		IsRattrapage: input.IsRattrapage,
		Remarque:     input.Remarque,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, controleConstraints)

		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données du contrôle", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}

		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}

		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Contrôle mis à jour", "id", input.ID)

	input.Version = version
	render.JSON(w, r, input)
}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func Delete(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}

	// Blocage métier : un jury délibéré bloque toute suppression qui le vide,
	// quel que soit le point d'entrée — contrôle unique du domaine jury.
	if jury.RefuserSiJuryDelibere(w, r, jury.PerimetreControle, input.IDs) {
		return
	}

	queries := getQueriesFromCtx(r)

	// Les notes emportées par la cascade laissent leur maillon note.delete
	// dans la transaction qui les détruit (invariant 5) — lues tant qu'elles
	// existent, avant le DELETE.
	pgCtx := services.GetPgCtx(r.Context())
	tx, err := pgCtx.Db.Begin(r.Context())
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("erreur début transaction: %w", err))
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := registre.TracerSuppressionEnCascade(r.Context(), tx, "controle", input.IDs, services.SubFromCtx(r)); err != nil {
		services.ServerError(w, r, err)
		return
	}

	if err := queries.WithTx(tx).DeleteControle(r.Context(), input.IDs); err != nil {
		services.ServerError(w, r, err)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		services.ServerError(w, r, fmt.Errorf("erreur commit transaction: %w", err))
		return
	}

	slog.Debug("Supression des contrôles", "ids", input.IDs)

	w.WriteHeader(http.StatusNoContent)
}
