package syllabus

// Traduction du contenu (lot 6) : lecture, relecture et proposition.
//
// Le français fait référence. Une traduction est un dérivé stocké, avec
// l'empreinte de la source dont elle est tirée ; elle est périmée quand cette
// empreinte n'est plus celle de la source courante — signalé dans la réponse
// (`perimee`), jamais bloquant : aucune écriture n'est refusée pour ce motif.
//
// Trois routes par nature (fiche de matière, description d'UE) :
//   - GET  …/traduction/{langue} (CONSULTATION) : la traduction, ou une
//     traduction vide `version: 0` — comme la fiche, elle « existe » toujours ;
//   - PUT  …/traduction/{langue} (SYLLABUS_ECRITURE) : upsert sous verrou
//     optimiste. `statut` dit qui parle : `relue` (le rédacteur dispose) ou
//     `automatique` (l'écran enregistre ce que le bouton « Traduire » a
//     proposé). version_source et empreinte_source sont celles de la source
//     que l'auteur a LUE, livrées par le GET ;
//   - POST …/traduction/{langue}/proposition (SYLLABUS_ECRITURE) : la
//     traduction automatique d'UN champ de la source enregistrée, sans rien
//     écrire. Un champ par requête : une fiche entière dépasserait le
//     writeTimeout du serveur et le proxy_read_timeout de nginx ; l'écran
//     enchaîne. Traducteur absent, en panne, ou sortie refusée par un
//     garde-fou : 503 SERVICE_UNAVAILABLE.
//
// Aucun texte d'interface ici : des données, des codes, des motifs.

import (
	"context"
	"errors"
	"net/http"
	"regexp"

	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/gen"
	"cyb-react/pkg/syllabus/traduction"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// relecture porte le traducteur des propositions ; nil = pas de traduction
// automatique (le GET le dit, l'écran n'offre pas le bouton — invariant 3).
type relecture struct {
	traducteur *traduction.Traducteur
}

var traductionConstraints = map[string]services.ConstraintRule{
	// Traduire une fiche jamais écrite : il n'y a pas de source.
	"fk_syllabus_matiere_traduction_fiche": {Field: "matiere_id", Motif: services.MotifReferenceInconnue},
	"fk_unite_enseignement_traduction_ue":  {Field: "ue_id", Motif: services.MotifReferenceInconnue},
}

var empreinteValide = regexp.MustCompile(`^[0-9a-f]{64}$`)

// EtatTraduction : ce que l'écran doit savoir au-delà de la ligne stockée.
type EtatTraduction struct {
	// Perimee : la traduction existe et sa source a changé depuis.
	Perimee bool `json:"perimee"`
	// SourceVersion / SourceEmpreinte : la source courante (0 et vide si elle
	// n'a jamais été écrite), à renvoyer telles quelles au PUT.
	SourceVersion   int32  `json:"source_version"`
	SourceEmpreinte string `json:"source_empreinte"`
	// TraductionAutomatique : un traducteur est configuré.
	TraductionAutomatique bool `json:"traduction_automatique"`
}

type TraductionMatiereReponse struct {
	gen.SyllabusMatiereTraduction
	EtatTraduction
}

type TraductionUeReponse struct {
	gen.UniteEnseignementTraduction
	EtatTraduction
}

// erreursEcriture valide ce que tout PUT de traduction porte en plus des
// textes : le statut, et l'empreinte de la source lue.
func erreursEcriture(statut, empreinte string) map[string]services.ConstraintError {
	errorsMap := map[string]services.ConstraintError{}
	if statut != traduction.StatutAutomatique && statut != traduction.StatutRelue {
		errorsMap["statut"] = services.ConstraintError{Motif: services.MotifReferenceInconnue}
	}
	if !empreinteValide.MatchString(empreinte) {
		errorsMap["empreinte_source"] = services.ConstraintError{Motif: services.MotifReferenceInconnue}
	}
	return errorsMap
}

// modele : une écriture automatique nomme son traducteur ; une relecture n'en
// nomme pas (la requête garde alors le dernier passé).
func (h *relecture) modele(statut string) *string {
	if statut != traduction.StatutAutomatique || h.traducteur == nil {
		return nil
	}
	nom := h.traducteur.Nom()
	return &nom
}

// langueDeLURL : seule `en` est admise ; sinon 400 INVALID_PARAM.
func langueDeLURL(w http.ResponseWriter, r *http.Request) (string, bool) {
	langue := chi.URLParam(r, "langue")
	if !traduction.LangueAdmise(langue) {
		services.InvalidRequestError(w, r, "langue de traduction non prise en charge", services.INVALID_PARAM, nil)
		return "", false
	}
	return langue, true
}

// ── Fiche de la matière ──────────────────────────────────────────────────────

func (h *relecture) etatMatiere(ctx context.Context, q *gen.Queries, t gen.SyllabusMatiereTraduction) (EtatTraduction, *gen.SyllabusMatiereSource, error) {
	etat := EtatTraduction{TraductionAutomatique: h.traducteur != nil}
	source, err := q.FetchSourceMatiere(ctx, t.MatiereID)
	if errors.Is(err, pgx.ErrNoRows) {
		return etat, nil, nil
	}
	if err != nil {
		return etat, nil, err
	}
	etat.SourceVersion, etat.SourceEmpreinte = source.Version, source.Empreinte
	etat.Perimee = t.Version > 0 && t.EmpreinteSource != source.Empreinte
	return etat, &source, nil
}

func (h *relecture) FetchTraductionMatiere(w http.ResponseWriter, r *http.Request) {
	langue, ok := langueDeLURL(w, r)
	if !ok {
		return
	}
	matiereID := getMatiereIDFromCtx(r)
	q := getQueriesFromCtx(r)

	t, err := q.FetchTraductionMatiere(r.Context(), gen.FetchTraductionMatiereParams{MatiereID: matiereID, Langue: langue})
	if errors.Is(err, pgx.ErrNoRows) {
		t, err = gen.SyllabusMatiereTraduction{MatiereID: matiereID, Langue: langue, Version: 0}, nil
	}
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	etat, _, err := h.etatMatiere(r.Context(), q, t)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	render.JSON(w, r, TraductionMatiereReponse{t, etat})
}

func (h *relecture) UpsertTraductionMatiere(w http.ResponseWriter, r *http.Request) {
	langue, ok := langueDeLURL(w, r)
	if !ok {
		return
	}
	var input gen.SyllabusMatiereTraduction
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	if errorsMap := erreursEcriture(input.Statut, input.EmpreinteSource); len(errorsMap) > 0 {
		services.InvalidRequestError(w, r, "erreur de validation de la traduction", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
		return
	}
	q := getQueriesFromCtx(r)
	e := input

	t, err := q.UpsertTraductionMatiere(r.Context(), gen.UpsertTraductionMatiereParams{
		MatiereID:         getMatiereIDFromCtx(r),
		Langue:            langue,
		Contexte:          input.Contexte,
		Objectifs:         input.Objectifs,
		Prerequis:         input.Prerequis,
		Activites:         input.Activites,
		Evaluation:        input.Evaluation,
		PlanCours:         input.PlanCours,
		Ressources:        input.Ressources,
		DimensionSocioEnv: input.DimensionSocioEnv,
		VersionSource:     e.VersionSource,
		EmpreinteSource:   e.EmpreinteSource,
		Statut:            e.Statut,
		Modele:            h.modele(e.Statut),
		Version:           e.Version,
	})
	if err != nil {
		h.erreurEcriture(w, r, err)
		return
	}
	etat, _, err := h.etatMatiere(r.Context(), q, t)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	render.JSON(w, r, TraductionMatiereReponse{t, etat})
}

func (h *relecture) erreurEcriture(w http.ResponseWriter, r *http.Request, err error) {
	if errorsMap := services.MapPgErrorToValidationErrors(err, traductionConstraints); len(errorsMap) > 0 {
		services.InvalidRequestError(w, r, "erreur de validation de la traduction", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
		return
	}
	services.ServerError(w, r, err)
}

// RubriquesSource nomme chaque rubrique de la source avec son texte, dans
// l'ordre de la maquette. Exportée : la campagne (CLI) parcourt la même liste.
func RubriquesSource(s *gen.SyllabusMatiereSource) []ChampSource {
	return []ChampSource{
		{"contexte", s.Contexte}, {"objectifs", s.Objectifs}, {"prerequis", s.Prerequis},
		{"activites", s.Activites}, {"evaluation", s.Evaluation}, {"plan_cours", s.PlanCours},
		{"ressources", s.Ressources}, {"dimension_socio_env", s.DimensionSocioEnv},
	}
}

type ChampSource struct {
	Nom   string
	Texte *string
}

// Proposition : la traduction d'un champ, et la source dont elle est tirée —
// l'écran abandonne l'enchaînement si l'empreinte change en cours de route.
type Proposition struct {
	Champ           string `json:"champ"`
	Texte           string `json:"texte"`
	SourceVersion   int32  `json:"source_version"`
	SourceEmpreinte string `json:"source_empreinte"`
}

func (h *relecture) ProposerTraductionMatiere(w http.ResponseWriter, r *http.Request) {
	if _, ok := langueDeLURL(w, r); !ok {
		return
	}
	champ, ok := champDemande(w, r)
	if !ok {
		return
	}
	source, err := getQueriesFromCtx(r).FetchSourceMatiere(r.Context(), getMatiereIDFromCtx(r))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "fiche syllabus jamais écrite", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}
	for _, c := range RubriquesSource(&source) {
		if c.Nom == champ {
			h.proposer(w, r, c, source.Version, source.Empreinte)
			return
		}
	}
	services.InvalidRequestError(w, r, "champ inconnu", services.VALIDATION_ERROR, map[string]interface{}{
		"errors": map[string]services.ConstraintError{"champ": {Motif: services.MotifReferenceInconnue}},
	})
}

func champDemande(w http.ResponseWriter, r *http.Request) (string, bool) {
	var input struct {
		Champ string `json:"champ"`
	}
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return "", false
	}
	return input.Champ, true
}

func (h *relecture) proposer(w http.ResponseWriter, r *http.Request, c ChampSource, version int32, empreinte string) {
	if h.traducteur == nil {
		services.ServiceUnavailableError(w, r, errors.New("aucun traducteur configuré (ia.provider vide)"))
		return
	}
	texte := ""
	if c.Texte != nil {
		var err error
		if texte, err = h.traducteur.Traduire(r.Context(), *c.Texte); err != nil {
			// Fournisseur en panne ou sortie refusée : pour l'écran, pas de
			// traduction — la cause part au log avec l'incident.
			services.ServiceUnavailableError(w, r, err)
			return
		}
	}
	render.JSON(w, r, Proposition{Champ: c.Nom, Texte: texte, SourceVersion: version, SourceEmpreinte: empreinte})
}

// ── Description de l'UE ──────────────────────────────────────────────────────

func (h *relecture) etatUe(ctx context.Context, q *gen.Queries, t gen.UniteEnseignementTraduction) (EtatTraduction, error) {
	etat := EtatTraduction{TraductionAutomatique: h.traducteur != nil}
	source, err := q.FetchSourceUe(ctx, t.UeID)
	if err != nil {
		return etat, err
	}
	etat.SourceVersion, etat.SourceEmpreinte = source.Version, source.Empreinte
	etat.Perimee = t.Version > 0 && t.EmpreinteSource != source.Empreinte
	return etat, nil
}

func (h *relecture) FetchTraductionUe(w http.ResponseWriter, r *http.Request) {
	langue, ok := langueDeLURL(w, r)
	if !ok {
		return
	}
	ue := getUniteEnseignementFromCtx(r)
	q := getQueriesFromCtx(r)

	t, err := q.FetchTraductionUe(r.Context(), gen.FetchTraductionUeParams{UeID: ue.ID, Langue: langue})
	if errors.Is(err, pgx.ErrNoRows) {
		t, err = gen.UniteEnseignementTraduction{UeID: ue.ID, Langue: langue, Version: 0}, nil
	}
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	etat, err := h.etatUe(r.Context(), q, t)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	render.JSON(w, r, TraductionUeReponse{t, etat})
}

func (h *relecture) UpsertTraductionUe(w http.ResponseWriter, r *http.Request) {
	langue, ok := langueDeLURL(w, r)
	if !ok {
		return
	}
	var input gen.UniteEnseignementTraduction
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	if errorsMap := erreursEcriture(input.Statut, input.EmpreinteSource); len(errorsMap) > 0 {
		services.InvalidRequestError(w, r, "erreur de validation de la traduction", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
		return
	}
	q := getQueriesFromCtx(r)
	e := input

	t, err := q.UpsertTraductionUe(r.Context(), gen.UpsertTraductionUeParams{
		UeID:            getUniteEnseignementFromCtx(r).ID,
		Langue:          langue,
		Description:     input.Description,
		VersionSource:   e.VersionSource,
		EmpreinteSource: e.EmpreinteSource,
		Statut:          e.Statut,
		Modele:          h.modele(e.Statut),
		Version:         e.Version,
	})
	if err != nil {
		h.erreurEcriture(w, r, err)
		return
	}
	etat, err := h.etatUe(r.Context(), q, t)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	render.JSON(w, r, TraductionUeReponse{t, etat})
}

func (h *relecture) ProposerTraductionUe(w http.ResponseWriter, r *http.Request) {
	if _, ok := langueDeLURL(w, r); !ok {
		return
	}
	if _, ok := champDemande(w, r); !ok {
		return
	}
	source, err := getQueriesFromCtx(r).FetchSourceUe(r.Context(), getUniteEnseignementFromCtx(r).ID)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	h.proposer(w, r, ChampSource{"description", source.Description}, source.Version, source.Empreinte)
}
