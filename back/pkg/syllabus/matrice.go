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
// formation de l'UE. L'INSERT … SELECT joint la chaîne réelle et ne peut
// insérer qu'une compétence de la bonne formation ; une ligne non insérée
// annule tout — la matrice antérieure reste intacte — et se signale au motif
// `hors_formation` (compétence existante, autre formation) ou
// `reference_inconnue` (identifiant inconnu).

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/gen"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
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
	queries := gen.New(pgCtx.Db)

	tx, err := pgCtx.Db.Begin(r.Context())
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	qtx := queries.WithTx(tx)

	if err := qtx.DeleteUeCompetences(r.Context(), ue.ID); err != nil {
		services.ServerError(w, r, err)
		return
	}
	for _, ligne := range input {
		inserees, err := qtx.InsertUeCompetence(r.Context(), gen.InsertUeCompetenceParams{
			UeID:         ue.ID,
			CompetenceID: ligne.CompetenceID,
			Enseignee:    ligne.Enseignee,
			MiseEnOeuvre: ligne.MiseEnOeuvre,
			Evaluee:      ligne.Evaluee,
		})
		if err != nil {
			errorsMap := services.MapPgErrorToValidationErrors(err, matriceConstraints)
			if len(errorsMap) > 0 {
				services.InvalidRequestError(w, r, "erreur de validation de la matrice de compétences", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
				return
			}
			services.ServerError(w, r, err)
			return
		}
		if inserees == 0 {
			// Rien d'inséré : la jointure a écarté la compétence. Inconnue, ou
			// d'une autre formation — le motif le dit, et le rollback différé
			// rend la matrice antérieure intacte.
			motif := services.MotifHorsFormation
			if _, err := queries.CheckCompetenceExists(r.Context(), ligne.CompetenceID); errors.Is(err, pgx.ErrNoRows) {
				motif = services.MotifReferenceInconnue
			} else if err != nil {
				services.ServerError(w, r, err)
				return
			}
			services.InvalidRequestError(w, r, "compétence hors du périmètre de l'UE", services.VALIDATION_ERROR,
				map[string]interface{}{"errors": map[string]services.ConstraintError{"competence_id": {Motif: motif}}})
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		services.ServerError(w, r, err)
		return
	}

	lignes, err := queries.FetchUeCompetences(r.Context(), ue.ID)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if lignes == nil {
		lignes = []gen.UeCompetence{}
	}
	slog.Debug("Matrice de compétences remplacée", "ue_id", ue.ID, "lignes", len(lignes))
	render.JSON(w, r, lignes)
}
