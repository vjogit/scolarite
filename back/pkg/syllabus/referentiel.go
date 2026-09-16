package syllabus

// Le référentiel de compétences d'une formation (lot 3) : blocs, puis
// compétences d'un bloc. Deux cycles CRUD sur le modèle d'`unite_enseignement`
// — liste filtrée par le parent, création, lecture, mise à jour sous verrou
// optimiste, suppression groupée avec analyse d'impact. La formation d'un bloc
// et le bloc d'une compétence sont fixés à la création, jamais réécrits.
//
// L'ordre est une position : unique par parent, saisi, et le code « C{ordre} »
// se calcule à l'affichage. Une collision revient au champ `ordre` avec le
// motif `valeur_deja_utilisee`.

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/gen"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

var referentielConstraints = map[string]services.ConstraintRule{
	"fk_bloc_competence_formation":       {Field: "formation_id", Motif: services.MotifReferenceInconnue},
	"uk_bloc_competence_ordre":           {Field: "ordre", Motif: services.MotifValeurDejaUtilisee},
	"chk_bloc_competence_ordre_positive": {Field: "ordre", Motif: services.MotifValeurNegative},
	"chk_bloc_competence_libelle_length": {Field: "libelle", Motif: services.MotifChampObligatoire},

	"fk_competence_bloc":            {Field: "bloc_id", Motif: services.MotifReferenceInconnue},
	"uk_competence_ordre":           {Field: "ordre", Motif: services.MotifValeurDejaUtilisee},
	"chk_competence_ordre_positive": {Field: "ordre", Motif: services.MotifValeurNegative},
	"chk_competence_action_length":  {Field: "action", Motif: services.MotifChampObligatoire},
}

// BulkDeleteRequest est le corps des suppressions groupées et des analyses
// d'impact, le même que dans les domaines de structure.
type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

// repondreEcriture traduit l'erreur d'une écriture du référentiel : contrainte
// nommée → 400 ciblé, aucune ligne → 409 de version, sinon 500.
func repondreEcriture(w http.ResponseWriter, r *http.Request, err error, detail string) {
	errorsMap := services.MapPgErrorToValidationErrors(err, referentielConstraints)
	if len(errorsMap) > 0 {
		services.InvalidRequestError(w, r, detail, services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
		return
	}
	services.ServerError(w, r, err)
}

// parentID lit et vérifie le paramètre de filtrage d'une liste (`formation_id`,
// `bloc_id`) ; `existe` dit si le parent est connu. Faux si une réponse a été émise.
func parentID(w http.ResponseWriter, r *http.Request, nom string, libelle string, existe func(context.Context, int32) error) (int32, bool) {
	brut := r.URL.Query().Get(nom)
	if brut == "" {
		services.InvalidRequestError(w, r, nom+" requis", services.MISSING_PARAM, nil)
		return 0, false
	}
	id, err := strconv.Atoi(brut)
	if err != nil {
		services.InvalidRequestError(w, r, nom+" invalide", services.INVALID_PARAM, nil)
		return 0, false
	}
	if err := existe(r.Context(), int32(id)); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, libelle+" introuvable", services.NOT_FOUND, nil)
			return 0, false
		}
		services.ServerError(w, r, err)
		return 0, false
	}
	return int32(id), true
}

// ── Blocs ────────────────────────────────────────────────────────────────

func FetchBlocsByFormationID(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)
	formationID, ok := parentID(w, r, "formation_id", "Formation", func(ctx context.Context, id int32) error {
		_, err := queries.CheckFormationExists(ctx, id)
		return err
	})
	if !ok {
		return
	}
	blocs, err := queries.FetchBlocsByFormationID(r.Context(), formationID)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if blocs == nil {
		blocs = []gen.BlocCompetence{}
	}
	render.JSON(w, r, blocs)
}

func FetchBloc(w http.ResponseWriter, r *http.Request) {
	render.JSON(w, r, getBlocFromCtx(r))
}

func CreateBloc(w http.ResponseWriter, r *http.Request) {
	var input gen.BlocCompetence
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	bloc, err := getQueriesFromCtx(r).CreateBloc(r.Context(), gen.CreateBlocParams{
		FormationID:         input.FormationID,
		Ordre:               input.Ordre,
		Libelle:             input.Libelle,
		Code:                input.Code,
		Activites:           input.Activites,
		ModalitesEvaluation: input.ModalitesEvaluation,
	})
	if err != nil {
		repondreEcriture(w, r, err, "erreur de validation du bloc de compétences")
		return
	}
	slog.Debug("Bloc de compétences créé", "id", bloc.ID)
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, bloc)
}

func UpdateBloc(w http.ResponseWriter, r *http.Request) {
	var input gen.BlocCompetence
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	bloc := getBlocFromCtx(r)
	maj, err := getQueriesFromCtx(r).UpdateBloc(r.Context(), gen.UpdateBlocParams{
		ID:                  bloc.ID,
		Version:             input.Version,
		Ordre:               input.Ordre,
		Libelle:             input.Libelle,
		Code:                input.Code,
		Activites:           input.Activites,
		ModalitesEvaluation: input.ModalitesEvaluation,
	})
	if err != nil {
		repondreEcriture(w, r, err, "erreur de validation du bloc de compétences")
		return
	}
	slog.Debug("Bloc de compétences mis à jour", "id", maj.ID, "version", maj.Version)
	render.JSON(w, r, maj)
}

func DeleteBlocs(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	if err := getQueriesFromCtx(r).DeleteBlocs(r.Context(), input.IDs); err != nil {
		services.ServerError(w, r, err)
		return
	}
	slog.Debug("Suppression de blocs de compétences", "ids", input.IDs)
	w.WriteHeader(http.StatusNoContent)
}

// BlocDeleteImpact annonce, sans rien modifier, ce que la suppression des
// blocs emporte : leurs compétences et les liaisons de celles-ci aux UE.
func BlocDeleteImpact(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête invalide", services.INVALID_BODY, nil)
		return
	}
	queries := getQueriesFromCtx(r)
	noms, err := queries.FetchBlocNamesByIds(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : lecture des blocs impossible (ids %v): %w", input.IDs, err))
		return
	}
	impact, err := queries.BlocDeleteImpact(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : comptage des blocs impossible (ids %v): %w", input.IDs, err))
		return
	}
	resp := services.NewDeleteImpactResponse()
	for _, n := range noms {
		resp.Items = append(resp.Items, services.DeleteImpactItem{ID: n.ID, Name: n.Name})
	}
	resp.AddCascade("competence", impact.CompetenceCount)
	resp.AddCascade("ue_competence", impact.UeCompetenceCount)
	render.JSON(w, r, resp)
}

// ── Compétences ──────────────────────────────────────────────────────────

func FetchCompetencesByBlocID(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)
	blocID, ok := parentID(w, r, "bloc_id", "Bloc de compétences", func(ctx context.Context, id int32) error {
		_, err := queries.CheckBlocExists(ctx, id)
		return err
	})
	if !ok {
		return
	}
	competences, err := queries.FetchCompetencesByBlocID(r.Context(), blocID)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if competences == nil {
		competences = []gen.Competence{}
	}
	render.JSON(w, r, competences)
}

// FetchReferentielByFormationID rend le référentiel de la formation à plat,
// chaque compétence portant son bloc : la lecture de la matrice de l'UE.
func FetchReferentielByFormationID(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)
	formationID, ok := parentID(w, r, "formation_id", "Formation", func(ctx context.Context, id int32) error {
		_, err := queries.CheckFormationExists(ctx, id)
		return err
	})
	if !ok {
		return
	}
	lignes, err := queries.FetchReferentielByFormationID(r.Context(), formationID)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if lignes == nil {
		lignes = []gen.FetchReferentielByFormationIDRow{}
	}
	render.JSON(w, r, lignes)
}

func FetchCompetence(w http.ResponseWriter, r *http.Request) {
	render.JSON(w, r, getCompetenceFromCtx(r))
}

func CreateCompetence(w http.ResponseWriter, r *http.Request) {
	var input gen.Competence
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	competence, err := getQueriesFromCtx(r).CreateCompetence(r.Context(), gen.CreateCompetenceParams{
		BlocID:    input.BlocID,
		Ordre:     input.Ordre,
		Action:    input.Action,
		Contexte:  input.Contexte,
		Finalites: input.Finalites,
	})
	if err != nil {
		repondreEcriture(w, r, err, "erreur de validation de la compétence")
		return
	}
	slog.Debug("Compétence créée", "id", competence.ID)
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, competence)
}

func UpdateCompetence(w http.ResponseWriter, r *http.Request) {
	var input gen.Competence
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	competence := getCompetenceFromCtx(r)
	maj, err := getQueriesFromCtx(r).UpdateCompetence(r.Context(), gen.UpdateCompetenceParams{
		ID:        competence.ID,
		Version:   input.Version,
		Ordre:     input.Ordre,
		Action:    input.Action,
		Contexte:  input.Contexte,
		Finalites: input.Finalites,
	})
	if err != nil {
		repondreEcriture(w, r, err, "erreur de validation de la compétence")
		return
	}
	slog.Debug("Compétence mise à jour", "id", maj.ID, "version", maj.Version)
	render.JSON(w, r, maj)
}

func DeleteCompetences(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	if err := getQueriesFromCtx(r).DeleteCompetences(r.Context(), input.IDs); err != nil {
		services.ServerError(w, r, err)
		return
	}
	slog.Debug("Suppression de compétences", "ids", input.IDs)
	w.WriteHeader(http.StatusNoContent)
}

func CompetenceDeleteImpact(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête invalide", services.INVALID_BODY, nil)
		return
	}
	queries := getQueriesFromCtx(r)
	noms, err := queries.FetchCompetenceNamesByIds(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : lecture des compétences impossible (ids %v): %w", input.IDs, err))
		return
	}
	liaisons, err := queries.CompetenceDeleteImpact(r.Context(), input.IDs)
	if err != nil {
		services.ServerError(w, r, fmt.Errorf("impact de suppression : comptage des compétences impossible (ids %v): %w", input.IDs, err))
		return
	}
	resp := services.NewDeleteImpactResponse()
	for _, n := range noms {
		resp.Items = append(resp.Items, services.DeleteImpactItem{ID: n.ID, Name: n.Name})
	}
	resp.AddCascade("ue_competence", liaisons)
	render.JSON(w, r, resp)
}

// ── Contexte des routes paramétrées ──────────────────────────────────────

// BlocUse charge le bloc de l'URL dans le contexte ; NOT_FOUND sinon.
func BlocUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(chi.URLParam(r, "blocID"))
		if err != nil {
			services.InvalidRequestError(w, r, "identifiant de bloc invalide", services.INVALID_PARAM, nil)
			return
		}
		bloc, err := getQueriesFromCtx(r).FetchBlocById(r.Context(), int32(id))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				services.InvalidRequestError(w, r, "Bloc de compétences introuvable", services.NOT_FOUND, nil)
				return
			}
			services.ServerError(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), blocContextKey, &bloc)))
	})
}

// CompetenceUse charge la compétence de l'URL dans le contexte ; NOT_FOUND sinon.
func CompetenceUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(chi.URLParam(r, "competenceID"))
		if err != nil {
			services.InvalidRequestError(w, r, "identifiant de compétence invalide", services.INVALID_PARAM, nil)
			return
		}
		competence, err := getQueriesFromCtx(r).FetchCompetenceById(r.Context(), int32(id))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				services.InvalidRequestError(w, r, "Compétence introuvable", services.NOT_FOUND, nil)
				return
			}
			services.ServerError(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), competenceContextKey, &competence)))
	})
}

var (
	blocContextKey       = &services.ContextKey{Name: "syllabus bloc"}
	competenceContextKey = &services.ContextKey{Name: "syllabus competence"}
)

func getBlocFromCtx(r *http.Request) *gen.BlocCompetence {
	bloc, ok := r.Context().Value(blocContextKey).(*gen.BlocCompetence)
	if ok {
		return bloc
	}
	slog.Warn("contexte bloc absent")
	return &gen.BlocCompetence{}
}

func getCompetenceFromCtx(r *http.Request) *gen.Competence {
	competence, ok := r.Context().Value(competenceContextKey).(*gen.Competence)
	if ok {
		return competence
	}
	slog.Warn("contexte compétence absent")
	return &gen.Competence{}
}
