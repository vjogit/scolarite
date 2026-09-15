package syllabus

// La fiche PDF d'une UE et le livret d'une promotion (lot 5) : collecte des
// données, structure d'abord — le chemin UE → période → option → promotion →
// formation par les vues actives, les matières et leurs heures, les ECTS —,
// syllabus ensuite — description, fiches des matières, matrice, référentiel
// de la formation en entier —, puis rendu par le gabarit (fiche_gabarit.go)
// et conversion par le service PDF (services/pdf.go).
//
// Lecture sous CONSULTATION, comme les autres lectures du domaine. La langue
// des libellés se demande par `?lang=fr|en` (défaut fr) ; le contenu saisi
// n'est jamais traduit. Le service indisponible répond 503
// SERVICE_UNAVAILABLE, jamais un document tronqué : le PDF est entier en
// mémoire avant le premier octet écrit.
//
// Aucune requête ne joint la structure depuis le domaine syllabus : les
// lectures de structure passent par les repositories de structure (gen), les
// lectures syllabus par les requêtes des lots 1 et 3 plus
// FetchSyllabusMatieresByMatiereIDs.

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"cyb-react/pkg/services"
	formationgen "cyb-react/pkg/structure/formation/gen"
	matieregen "cyb-react/pkg/structure/matiere/gen"
	optiongen "cyb-react/pkg/structure/option/gen"
	periodegen "cyb-react/pkg/structure/periode/gen"
	promotiongen "cyb-react/pkg/structure/promotion/gen"
	uegen "cyb-react/pkg/structure/unite_enseignement/gen"
	"cyb-react/pkg/syllabus/gen"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// langueDemandee lit `?lang=` : fr par défaut, en, sinon 400 INVALID_PARAM.
// Faux si une réponse a été émise.
func langueDemandee(w http.ResponseWriter, r *http.Request) (*Libelles, bool) {
	lang := r.URL.Query().Get("lang")
	if lang == "" {
		lang = "fr"
	}
	l, ok := LibellesPour(lang)
	if !ok {
		services.InvalidRequestError(w, r, "lang doit valoir fr ou en", services.INVALID_PARAM, nil)
		return nil, false
	}
	return l, true
}

// FichePDF : GET /ue/{ueID}/fiche — la fiche de l'UE du contexte.
func (d *documentsPDF) FichePDF(w http.ResponseWriter, r *http.Request) {
	l, ok := langueDemandee(w, r)
	if !ok {
		return
	}
	ue := getUniteEnseignementFromCtx(r)
	pgCtx := services.GetPgCtx(r.Context())

	donnees, err := CollecterFiche(r.Context(), pgCtx.Db, ue.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// L'UE existe mais sa branche est en corbeille : pour l'application,
			// elle n'a plus de chemin.
			services.InvalidRequestError(w, r, "UniteEnseignement introuvable", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	html, err := RendreFiche(*donnees, l, d.etablissement)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	d.repondrePDF(w, r, html, "syllabus-ue-"+slug(donnees.UE.Nom)+"-"+l.Lang+".pdf")
}

// LivretPDF : GET /promotion/{promotionID}/livret — les fiches de toutes les
// UE de la promotion, dans l'ordre de la structure, derrière une page de
// titre.
func (d *documentsPDF) LivretPDF(w http.ResponseWriter, r *http.Request) {
	l, ok := langueDemandee(w, r)
	if !ok {
		return
	}
	id, err := strconv.Atoi(chi.URLParam(r, "promotionID"))
	if err != nil {
		services.InvalidRequestError(w, r, "identifiant de promotion invalide", services.INVALID_PARAM, nil)
		return
	}
	pgCtx := services.GetPgCtx(r.Context())

	donnees, err := CollecterLivret(r.Context(), pgCtx.Db, int32(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Promotion introuvable", services.NOT_FOUND, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	html, err := RendreLivret(*donnees, l, d.etablissement)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	d.repondrePDF(w, r, html, "syllabus-livret-"+slug(donnees.Promotion)+"-"+l.Lang+".pdf")
}

// repondrePDF convertit puis écrit : en-têtes et corps ne partent qu'une fois
// le document entier reçu du service. Service défaillant → 503.
func (d *documentsPDF) repondrePDF(w http.ResponseWriter, r *http.Request, html []byte, nomFichier string) {
	pdf, err := d.convertisseur.ConvertirHTML(r.Context(), html, services.A4Portrait)
	if err != nil {
		if services.EstServicePDFIndisponible(err) {
			services.ServiceUnavailableError(w, r, err)
			return
		}
		services.ServerError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", nomFichier))
	w.Header().Set("Content-Length", strconv.Itoa(len(pdf)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
}

// documentsPDF porte ce que les deux handlers partagent : le convertisseur et
// la marque du pied de page.
type documentsPDF struct {
	convertisseur *services.ConvertisseurPDF
	etablissement string
}

// ── Collecte ─────────────────────────────────────────────────────────────────

// chemin : le contexte de structure d'une UE, lu par les vues actives.
type chemin struct {
	Formation formationgen.FormationActive
	Promotion promotiongen.PromotionActive
	Option    optiongen.OptionActive
	Periode   periodegen.PeriodeActive
}

// cheminDe remonte de l'UE à la formation. Une entité en corbeille sur le
// chemin rend pgx.ErrNoRows : l'UE n'est plus atteignable.
func cheminDe(ctx context.Context, pool *pgxpool.Pool, ue uegen.UniteEnseignement) (*chemin, error) {
	c := &chemin{}
	var err error
	if c.Periode, err = periodegen.New(pool).FetchPeriodeById(ctx, ue.PeriodeID); err != nil {
		return nil, err
	}
	if c.Option, err = optiongen.New(pool).FetchOptionById(ctx, c.Periode.OptionID); err != nil {
		return nil, err
	}
	if c.Promotion, err = promotiongen.New(pool).FetchPromotionById(ctx, c.Option.PromotionID); err != nil {
		return nil, err
	}
	if c.Formation, err = formationgen.New(pool).FetchFormationById(ctx, c.Promotion.FormationID); err != nil {
		return nil, err
	}
	return c, nil
}

// referentiel : le référentiel d'une formation avec l'index qui permet de
// poser les marques d'une UE dessus — chargé une fois par document, marqué
// par copie pour chaque UE (les marques diffèrent).
type referentiel struct {
	blocs []BlocFiche
	index map[int32]map[int32]int // bloc → compétence → index dans Competences
	ids   map[int32]int32         // compétence → bloc
	pos   map[int32]int           // bloc → index dans blocs
}

func chargerReferentiel(ctx context.Context, queries *gen.Queries, formationID int32) (*referentiel, error) {
	blocs, err := queries.FetchBlocsByFormationID(ctx, formationID)
	if err != nil {
		return nil, err
	}
	competences, err := queries.FetchReferentielByFormationID(ctx, formationID)
	if err != nil {
		return nil, err
	}
	ref := &referentiel{index: map[int32]map[int32]int{}, ids: map[int32]int32{}, pos: map[int32]int{}}
	for i, b := range blocs {
		ref.blocs = append(ref.blocs, BlocFiche{Ordre: b.Ordre, Code: b.Code, Libelle: b.Libelle})
		ref.pos[b.ID] = i
		ref.index[b.ID] = map[int32]int{}
	}
	for _, c := range competences {
		i, ok := ref.pos[c.BlocID]
		if !ok {
			continue
		}
		ref.index[c.BlocID][c.ID] = len(ref.blocs[i].Competences)
		ref.ids[c.ID] = c.BlocID
		ref.blocs[i].Competences = append(ref.blocs[i].Competences, CompetenceFiche{Ordre: c.Ordre, Action: c.Action})
	}
	return ref, nil
}

// marquer : une copie du référentiel portant les marques de l'UE.
func (ref *referentiel) marquer(lignes []gen.UeCompetence) []BlocFiche {
	blocs := make([]BlocFiche, len(ref.blocs))
	for i, b := range ref.blocs {
		blocs[i] = b
		blocs[i].Competences = append([]CompetenceFiche(nil), b.Competences...)
	}
	for _, l := range lignes {
		blocID, ok := ref.ids[l.CompetenceID]
		if !ok {
			continue
		}
		i := ref.pos[blocID]
		j := ref.index[blocID][l.CompetenceID]
		c := &blocs[i].Competences[j]
		c.Enseignee, c.MiseEnOeuvre, c.Evaluee = l.Enseignee, l.MiseEnOeuvre, l.Evaluee
	}
	return blocs
}

// collecterUE : la fiche d'une UE dont le chemin et le référentiel sont déjà
// connus (le livret les partage entre ses UE).
func collecterUE(ctx context.Context, pool *pgxpool.Pool, queries *gen.Queries, ue uegen.UniteEnseignement, c *chemin, ref *referentiel) (*DonneesFiche, error) {
	matieres, err := matieregen.New(pool).FetchMatieresByUniteEnseignementID(ctx, ue.ID)
	if err != nil {
		return nil, err
	}
	// Ordre de la structure : celui de la saisie (identifiant), aucune colonne
	// d'ordre n'existe sur la matière (lot 0, hors chantier).
	sort.SliceStable(matieres, func(i, j int) bool { return matieres[i].ID < matieres[j].ID })

	ids := make([]int32, len(matieres))
	for i, m := range matieres {
		ids[i] = m.ID
	}
	fiches, err := queries.FetchSyllabusMatieresByMatiereIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	ficheDe := map[int32]*gen.SyllabusMatiere{}
	for i := range fiches {
		ficheDe[fiches[i].MatiereID] = &fiches[i]
	}

	lignes, err := queries.FetchUeCompetences(ctx, ue.ID)
	if err != nil {
		return nil, err
	}

	d := &DonneesFiche{
		Formation:    c.Formation.Name,
		Promotion:    c.Promotion.Name,
		Option:       c.Option.Name,
		Periode:      c.Periode.Name,
		PeriodeDebut: c.Periode.Debut.Time,
		UE:           UEFiche{Nom: ue.Name, Ects: ue.Ects, Description: ue.Description},
		Blocs:        ref.marquer(lignes),
	}
	for _, m := range matieres {
		d.UE.Matieres = append(d.UE.Matieres, MatiereFiche{Nom: m.Name, Heure: m.Heure, Coeff: m.Coeff, Fiche: ficheDe[m.ID]})
	}
	return d, nil
}

// CollecterFiche rassemble tout ce que la fiche d'une UE affiche.
// pgx.ErrNoRows si l'UE ou son chemin n'existe pas (vues actives).
func CollecterFiche(ctx context.Context, pool *pgxpool.Pool, ueID int32) (*DonneesFiche, error) {
	queries := gen.New(pool)
	ue, err := uegen.New(pool).FetchUniteEnseignementById(ctx, ueID)
	if err != nil {
		return nil, err
	}
	c, err := cheminDe(ctx, pool, ue)
	if err != nil {
		return nil, err
	}
	ref, err := chargerReferentiel(ctx, queries, c.Formation.ID)
	if err != nil {
		return nil, err
	}
	return collecterUE(ctx, pool, queries, ue, c, ref)
}

// CollecterLivret rassemble les fiches de toutes les UE d'une promotion :
// options par nom, périodes par date de début puis nom, UE par identifiant
// (l'ordre de saisie de la structure). pgx.ErrNoRows si la promotion n'est
// pas active.
func CollecterLivret(ctx context.Context, pool *pgxpool.Pool, promotionID int32) (*DonneesLivret, error) {
	queries := gen.New(pool)
	promotion, err := promotiongen.New(pool).FetchPromotionById(ctx, promotionID)
	if err != nil {
		return nil, err
	}
	formation, err := formationgen.New(pool).FetchFormationById(ctx, promotion.FormationID)
	if err != nil {
		return nil, err
	}
	ref, err := chargerReferentiel(ctx, queries, formation.ID)
	if err != nil {
		return nil, err
	}

	livret := &DonneesLivret{
		Formation:      formation.Name,
		Promotion:      promotion.Name,
		PromotionDebut: promotion.Debut.Time,
		PromotionFin:   promotion.Fin.Time,
	}

	options, err := optiongen.New(pool).FetchOptionsByPromotionID(ctx, promotionID)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(options, func(i, j int) bool { return strings.ToLower(options[i].Name) < strings.ToLower(options[j].Name) })

	for _, o := range options {
		periodes, err := periodegen.New(pool).FetchPeriodesByOptionID(ctx, o.ID)
		if err != nil {
			return nil, err
		}
		sort.SliceStable(periodes, func(i, j int) bool {
			if !periodes[i].Debut.Time.Equal(periodes[j].Debut.Time) {
				return periodes[i].Debut.Time.Before(periodes[j].Debut.Time)
			}
			return strings.ToLower(periodes[i].Name) < strings.ToLower(periodes[j].Name)
		})
		for _, pe := range periodes {
			ues, err := uegen.New(pool).FetchUniteEnseignementsByPeriodeID(ctx, pe.ID)
			if err != nil {
				return nil, err
			}
			sort.SliceStable(ues, func(i, j int) bool { return ues[i].ID < ues[j].ID })
			c := &chemin{Formation: formation, Promotion: promotion, Option: o, Periode: pe}
			for _, ue := range ues {
				fiche, err := collecterUE(ctx, pool, queries, ue, c, ref)
				if err != nil {
					return nil, err
				}
				livret.Fiches = append(livret.Fiches, *fiche)
			}
		}
	}
	return livret, nil
}

// slug : un nom d'entité rendu sûr pour un nom de fichier — ASCII, minuscules,
// tirets. Les accents tombent (é → e), tout le reste devient un tiret.
func slug(nom string) string {
	var b strings.Builder
	dernierTiret := true
	for _, r := range strings.ToLower(nom) {
		r = sansAccent(r)
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dernierTiret = false
		default:
			if !dernierTiret {
				b.WriteByte('-')
				dernierTiret = true
			}
		}
	}
	s := strings.Trim(b.String(), "-")
	if s == "" {
		return "document"
	}
	if len(s) > 60 {
		s = strings.Trim(s[:60], "-")
	}
	return s
}

var accents = map[rune]rune{
	'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a',
	'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
	'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ñ': 'n',
	'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o',
	'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y', 'ÿ': 'y',
	'œ': 'o', 'æ': 'a',
}

func sansAccent(r rune) rune {
	if s, ok := accents[r]; ok {
		return s
	}
	if r > unicode.MaxASCII {
		return '-'
	}
	return r
}
