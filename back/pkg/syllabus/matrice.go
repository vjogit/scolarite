package syllabus

// La matrice de l'UE (lot 3) : les compétences qu'elle adresse, chacune avec
// ses trois axes Enseignée / Mise en œuvre / Évaluée. Une ligne dont les trois
// axes sont faux n'existe pas — la ligne absente est l'état « non adressée ».
//
// L'écriture est un remplacement intégral, sans verrou : DELETE des lignes de
// l'UE puis INSERT des lignes reçues, dans une transaction — dernier écrit
// gagne, choix utilisateur. La version de l'UE n'est pas touchée : un
// enregistrement de matrice ne fait jamais 409 sur un écran de structure, ni
// l'inverse.
//
// Périmètre : une compétence ne se lie à l'UE que si son bloc appartient à la
// promotion de l'UE (référentiel par promotion depuis le 16 septembre 2026).
// L'INSERT … SELECT joint la chaîne réelle et ne peut insérer qu'une
// compétence de la bonne promotion ; une ligne non insérée annule tout — la
// matrice antérieure reste intacte — et se signale au motif `hors_promotion`
// (compétence existante, autre promotion) ou `reference_inconnue`
// (identifiant inconnu).

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/gen"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var matriceConstraints = map[string]services.ConstraintRule{
	"pk_ue_competence":              {Field: "competence_id", Motif: services.MotifValeurDejaUtilisee},
	"chk_ue_competence_au_moins_un": {Field: "competence_id", Motif: services.MotifChampObligatoire},
}

func FetchUeCompetences(w http.ResponseWriter, r *http.Request) {
	ue := getUniteEnseignementFromCtx(r)
	lignes, err := getQueriesFromCtx(r).FetchUeCompetences(r.Context(), ue.ID)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if lignes == nil {
		lignes = []gen.UeCompetence{}
	}
	render.JSON(w, r, lignes)
}

// ErreurCompetence est la ligne qu'un remplacement de matrice a écartée :
// la jointure de périmètre n'a rien inséré pour cette compétence. Le motif
// distingue la compétence inconnue de celle d'une autre promotion.
type ErreurCompetence struct {
	CompetenceID int32
	Motif        string
}

func (e *ErreurCompetence) Error() string {
	return fmt.Sprintf("compétence %d écartée (%s)", e.CompetenceID, e.Motif)
}

// RemplacerMatrice est le remplacement intégral de la matrice d'une UE, hors
// HTTP : DELETE puis INSERT … SELECT de chaque ligne dans une transaction, et
// relecture dans l'ordre du référentiel. Une ligne non insérée annule tout et
// revient en *ErreurCompetence (la matrice antérieure est intacte) ; une
// contrainte nommée revient telle quelle, pour MapPgErrorToValidationErrors.
// Le handler ReplaceUeCompetences et l'import du legacy (lot 4) passent tous
// deux par ici : la garantie de périmètre n'a qu'une implémentation.
func RemplacerMatrice(ctx context.Context, db *pgxpool.Pool, ueID int32, lignes []gen.UeCompetence) ([]gen.UeCompetence, error) {
	queries := gen.New(db)
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := queries.WithTx(tx)

	if err := qtx.DeleteUeCompetences(ctx, ueID); err != nil {
		return nil, err
	}
	for _, ligne := range lignes {
		inserees, err := qtx.InsertUeCompetence(ctx, gen.InsertUeCompetenceParams{
			UeID:         ueID,
			CompetenceID: ligne.CompetenceID,
			Enseignee:    ligne.Enseignee,
			MiseEnOeuvre: ligne.MiseEnOeuvre,
			Evaluee:      ligne.Evaluee,
		})
		if err != nil {
			return nil, err
		}
		if inserees == 0 {
			// Rien d'inséré : la jointure a écarté la compétence. Inconnue, ou
			// d'une autre promotion — le motif le dit, et le rollback différé
			// rend la matrice antérieure intacte.
			motif := services.MotifHorsPromotion
			if _, err := queries.CheckCompetenceExists(ctx, ligne.CompetenceID); errors.Is(err, pgx.ErrNoRows) {
				motif = services.MotifReferenceInconnue
			} else if err != nil {
				return nil, err
			}
			return nil, &ErreurCompetence{CompetenceID: ligne.CompetenceID, Motif: motif}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	relues, err := queries.FetchUeCompetences(ctx, ueID)
	if err != nil {
		return nil, err
	}
	if relues == nil {
		relues = []gen.UeCompetence{}
	}
	return relues, nil
}

// ReplaceUeCompetences remplace la matrice de l'UE du chemin par les lignes
// reçues — l'identifiant d'UE du corps est ignoré — et renvoie la matrice
// relue, dans l'ordre du référentiel.
func ReplaceUeCompetences(w http.ResponseWriter, r *http.Request) {
	var input []gen.UeCompetence
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	ue := getUniteEnseignementFromCtx(r)
	pgCtx := services.GetPgCtx(r.Context())

	lignes, err := RemplacerMatrice(r.Context(), pgCtx.Db, ue.ID, input)
	if err != nil {
		var ecartee *ErreurCompetence
		if errors.As(err, &ecartee) {
			services.InvalidRequestError(w, r, "compétence hors du périmètre de l'UE", services.VALIDATION_ERROR,
				map[string]interface{}{"errors": map[string]services.ConstraintError{"competence_id": {Motif: ecartee.Motif}}})
			return
		}
		errorsMap := services.MapPgErrorToValidationErrors(err, matriceConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation de la matrice de compétences", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		services.ServerError(w, r, err)
		return
	}
	slog.Debug("Matrice de compétences remplacée", "ue_id", ue.ID, "lignes", len(lignes))
	render.JSON(w, r, lignes)
}
