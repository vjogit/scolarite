package syllabus

// Le gabarit de la fiche syllabus et du livret (lot 5), dérivé de la maquette
// validée au lot 0 (docs/syllabus/fiche-maquette.html, intouchée) : une page
// pour l'UE — bandeau, chiffres clés, « Pourquoi cette UE ? », éléments
// constitutifs, matrice de compétences — puis une page par matière. Le livret
// d'une promotion ajoute une page de titre avec le sommaire et enchaîne les
// fiches de toutes ses UE.
//
// Ce fichier ne lit rien en base : il reçoit des données déjà rassemblées
// (fiche.go) et produit le HTML que le service de conversion transforme en
// PDF. C'est ce qui rend le gabarit testable seul, sans base ni service —
// les assertions du lot vivent sur ce HTML (décision 5).
//
// Principes de rendu, hérités de la maquette : la structure fait référence
// (matiere.heure, ects, noms), rien de vide ne s'imprime, chaque série de
// chiffres a son total, la matrice se lit sans légende, et aucune absence
// n'est silencieuse — une UE sans liaison ou une matière sans fiche le dit
// en une phrase. La fiche est bilingue par ses libellés seulement : le
// contenu saisi est rendu tel quel, dans sa langue de rédaction.

import (
	"bytes"
	_ "embed"
	"fmt"
	"html/template"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode"

	"cyb-react/pkg/syllabus/gen"
	"cyb-react/pkg/syllabus/traduction"
)

//go:embed fiche_gabarit.html
var sourceGabarit string

var gabarit = template.Must(template.New("fiche").Parse(sourceGabarit))

// Libelles : les mots du gabarit dans une langue. Deux jeux, fr et en ; le
// contenu saisi n'est jamais traduit.
type Libelles struct {
	Lang                 string
	TitreDocument        string
	Syllabus             string
	Livret               string
	Sommaire             string
	Ects                 string
	EnseignementEncadre  string
	TravailPersonnel     string
	Enseignements        string
	Enseignement         string
	PourquoiUe           string
	ElementsConstitutifs string
	Heures               string
	Coeff                string
	VolumeEncadreUe      string
	QuestionCompetences  string
	Competence           string
	Enseignee            string
	MiseEnOeuvre         string
	Evaluee              string
	BlocsNonMobilises    string
	AucuneCompetence     string
	ContexteEnjeux       string
	Prerequis            string
	VolumesHoraires      string
	Encadre              string
	Ecart                string
	Objectifs            string
	ObjectifsPrecision   string
	Activites            string
	ActivitesPrecision   string
	Evaluation           string
	PlanCours            string
	Ressources           string
	DimensionSocioEnv    string
	FicheAbsente         string
	// Traduit : le contenu du document est servi par sa traduction stockée
	// (lot 6). Faux pour le français, la langue de référence. Les trois
	// mentions ne servent qu'à un document traduit.
	Traduit            bool
	MentionNonTraduit  string
	MentionAutomatique string
	MentionPerimee     string // format : date de la traduction
	Page               string
	Heure              string
	HeuresVentilation  map[string]string
	Formation          string
	Promotion          string
	Option             string
	Periode            string
}

var libellesFr = Libelles{
	Lang:                 "fr",
	TitreDocument:        "Fiche syllabus",
	Syllabus:             "Syllabus",
	Livret:               "Livret syllabus",
	Sommaire:             "Sommaire",
	Ects:                 "ECTS",
	EnseignementEncadre:  "enseignement encadré",
	TravailPersonnel:     "travail personnel",
	Enseignements:        "enseignements",
	Enseignement:         "Enseignement",
	PourquoiUe:           "Pourquoi cette UE ?",
	ElementsConstitutifs: "Éléments constitutifs de l'UE",
	Heures:               "Heures",
	Coeff:                "Coeff.",
	VolumeEncadreUe:      "Volume encadré de l'UE",
	QuestionCompetences:  "Parmi les compétences visées par la formation, lesquelles sont développées dans cette UE ?",
	Competence:           "Compétence",
	Enseignee:            "Enseignée",
	MiseEnOeuvre:         "Mise en œuvre",
	Evaluee:              "Évaluée",
	BlocsNonMobilises:    "Les autres blocs de compétences de la formation ne sont pas mobilisés par cette UE. Une compétence sans marque n'est pas adressée dans cette UE.",
	AucuneCompetence:     "Aucune compétence n'est encore déclarée pour cette UE.",
	ContexteEnjeux:       "Contexte et enjeux de l'enseignement",
	Prerequis:            "Prérequis",
	VolumesHoraires:      "Volumes horaires",
	Encadre:              "Encadré",
	Ecart:                "Total encadré : %s h — la structure prévoit %s h",
	Objectifs:            "Objectifs pédagogiques",
	ObjectifsPrecision:   "— à la fin de cet enseignement, l'étudiant sera capable de…",
	Activites:            "Activités",
	ActivitesPrecision:   "— CM, TD, TP, projet…",
	Evaluation:           "Évaluations et retours faits aux élèves",
	PlanCours:            "Plan de cours",
	Ressources:           "Ressources et références",
	DimensionSocioEnv:    "Dimension socio-environnementale",
	FicheAbsente:         "Aucune fiche syllabus n'est encore rédigée pour cet enseignement.",
	Page:                 "page",
	Heure:                "h",
	HeuresVentilation: map[string]string{
		"heures_cours":     "Cours",
		"heures_cours_td":  "Cours intégré (cours + TD)",
		"heures_td":        "TD",
		"heures_tp":        "TP",
		"heures_projet":    "Projet",
		"heures_autonomie": "Autonomie encadrée",
		"heures_controle":  "Contrôles et soutenances",
		"heures_perso":     "Travail personnel",
	},
	Formation: "Formation",
	Promotion: "Promotion",
	Option:    "Option",
	Periode:   "Période",
}

var libellesEn = Libelles{
	Lang:                 "en",
	TitreDocument:        "Syllabus sheet",
	Syllabus:             "Syllabus",
	Livret:               "Syllabus booklet",
	Sommaire:             "Contents",
	Ects:                 "ECTS",
	EnseignementEncadre:  "supervised teaching",
	TravailPersonnel:     "personal work",
	Enseignements:        "courses",
	Enseignement:         "Course",
	PourquoiUe:           "Why this unit?",
	ElementsConstitutifs: "Components of the unit",
	Heures:               "Hours",
	Coeff:                "Weight",
	VolumeEncadreUe:      "Supervised volume of the unit",
	QuestionCompetences:  "Among the skills targeted by the programme, which ones are developed in this unit?",
	Competence:           "Skill",
	Enseignee:            "Taught",
	MiseEnOeuvre:         "Applied",
	Evaluee:              "Assessed",
	BlocsNonMobilises:    "The other skill blocks of the programme are not involved in this unit. A skill without a mark is not addressed in this unit.",
	AucuneCompetence:     "No skill has been declared for this unit yet.",
	ContexteEnjeux:       "Context and stakes of the course",
	Prerequis:            "Prerequisites",
	VolumesHoraires:      "Hours",
	Encadre:              "Supervised",
	Ecart:                "Supervised total: %s h — the structure plans %s h",
	Objectifs:            "Learning objectives",
	ObjectifsPrecision:   "— by the end of this course, the student will be able to…",
	Activites:            "Activities",
	ActivitesPrecision:   "— lectures, tutorials, labs, project…",
	Evaluation:           "Assessment and feedback to students",
	PlanCours:            "Course outline",
	Ressources:           "Resources and references",
	DimensionSocioEnv:    "Social and environmental dimension",
	FicheAbsente:         "No syllabus sheet has been written for this course yet.",
	Traduit:              true,
	MentionNonTraduit:    "Not yet translated — shown in the French original.",
	MentionAutomatique:   "Machine translation, not yet reviewed — the French original prevails.",
	MentionPerimee:       "Translation of an earlier version of the French original (translated on %s) — the French original prevails.",
	Page:                 "page",
	Heure:                "h",
	HeuresVentilation: map[string]string{
		"heures_cours":     "Lectures",
		"heures_cours_td":  "Integrated course (lectures + tutorials)",
		"heures_td":        "Tutorials",
		"heures_tp":        "Labs",
		"heures_projet":    "Project",
		"heures_autonomie": "Supervised self-study",
		"heures_controle":  "Exams and defenses",
		"heures_perso":     "Personal work",
	},
	Formation: "Programme",
	Promotion: "Cohort",
	Option:    "Track",
	Periode:   "Period",
}

// LibellesPour rend le jeu d'une langue ; faux si la langue n'est pas servie.
// Seules fr et en existent (hors périmètre : toute autre langue).
func LibellesPour(lang string) (*Libelles, bool) {
	switch lang {
	case "fr":
		return &libellesFr, true
	case "en":
		return &libellesEn, true
	}
	return nil, false
}

// ── Données d'entrée : ce que fiche.go rassemble ─────────────────────────────

// DonneesFiche : tout ce qu'une fiche d'UE affiche, structure d'abord
// (noms, heures, ects, chemin), syllabus ensuite (description, fiches des
// matières, matrice), référentiel de la formation en entier.
type DonneesFiche struct {
	Formation    string
	Promotion    string
	Option       string
	Periode      string
	PeriodeDebut time.Time
	UE           UEFiche
	Blocs        []BlocFiche
}

type UEFiche struct {
	Nom         string
	Ects        float32
	Description *string
	// Traduction de la description dans la langue du document (lot 6) ; nil
	// si elle n'existe pas ou si le document est en français.
	Traduction *TraductionDescription
	Matieres   []MatiereFiche
}

// TraductionDescription / TraductionFiche : la ligne stockée et son état
// vis-à-vis de la source courante.
type TraductionDescription struct {
	Ligne   gen.UniteEnseignementTraduction
	Perimee bool
}

type TraductionFiche struct {
	Ligne   gen.SyllabusMatiereTraduction
	Perimee bool
}

// MatiereFiche : la matière de la structure et, si elle existe, sa fiche.
type MatiereFiche struct {
	Nom   string
	Heure float32
	Coeff float32
	Fiche *gen.SyllabusMatiere
	// Traduction de la fiche dans la langue du document (lot 6), ou nil.
	Traduction *TraductionFiche
}

// BlocFiche : un bloc du référentiel avec ses compétences et, pour chacune,
// les marques de l'UE. La contribution du bloc est dérivée (au moins une
// marque), jamais stockée.
type BlocFiche struct {
	Ordre       int32
	Code        *string
	Libelle     string
	Competences []CompetenceFiche
}

type CompetenceFiche struct {
	Ordre        int32
	Action       string
	Enseignee    bool
	MiseEnOeuvre bool
	Evaluee      bool
}

// Mobilise : au moins une compétence du bloc porte une marque.
func (b BlocFiche) Mobilise() bool {
	for _, c := range b.Competences {
		if c.Enseignee || c.MiseEnOeuvre || c.Evaluee {
			return true
		}
	}
	return false
}

// DonneesLivret : la promotion et ses fiches, dans l'ordre de la structure
// (options, puis périodes, puis UE).
type DonneesLivret struct {
	Formation      string
	Promotion      string
	PromotionDebut time.Time
	PromotionFin   time.Time
	Fiches         []DonneesFiche
}

// ── Vue du gabarit : calculée ici, le gabarit reste sans logique ─────────────

type vueDocument struct {
	L             *Libelles
	Titre         string
	Etablissement string
	Livret        *vueLivret
	Fiches        []vueFiche
}

type vueLivret struct {
	Formation string
	Promotion string
	Annees    string
	Sommaire  []vueSommaireOption
}

type vueSommaireOption struct {
	Option   string
	Periodes []vueSommairePeriode
}

type vueSommairePeriode struct {
	Periode string
	UEs     []string
}

type vueFiche struct {
	Formation         string
	Periode           string
	Annee             string
	Nom               string
	Ects              string
	VolumeEncadre     string
	TravailPerso      string
	NbEnseignements   int
	Description       []blocTexte
	MentionTraduction string
	Matieres          []vueMatiereLigne
	BlocsMobilises    []vueBloc
	AucuneLiaison     bool
	AutresBlocs       bool
	Pages             int
	PagesMatiere      []vuePageMatiere
	PiedContexte      string
}

type vueMatiereLigne struct {
	Nom   string
	Heure string
	Coeff string
}

type vueBloc struct {
	Code        string
	Libelle     string
	Competences []vueCompetence
}

type vueCompetence struct {
	Code         string
	Action       string
	Enseignee    bool
	MiseEnOeuvre bool
	Evaluee      bool
}

type vuePageMatiere struct {
	Numero            int
	Nom               string
	FicheAbsente      bool
	MentionTraduction string
	Contexte          []blocTexte
	Prerequis         []blocTexte
	Objectifs         []blocTexte
	Activites         []blocTexte
	Evaluation        []blocTexte
	PlanCours         []blocTexte
	Ressources        []blocTexte
	DimensionSocioEnv []blocTexte
	Heures            []vueLigneHeures
	TotalEncadre      string
	AHeures           bool
	Ecart             string
}

type vueLigneHeures struct {
	Libelle string
	Valeur  string
}

// blocTexte : un paragraphe ou une liste, découpé depuis le texte saisi.
type blocTexte struct {
	Lignes []string
	Liste  bool
}

// ── Rendu ────────────────────────────────────────────────────────────────────

// RendreFiche produit le HTML de la fiche d'une UE, dans la langue des
// libellés donnés.
func RendreFiche(donnees DonneesFiche, l *Libelles, etablissement string) ([]byte, error) {
	vue := vueDocument{
		L:             l,
		Titre:         l.TitreDocument + " — " + donnees.UE.Nom,
		Etablissement: etablissement,
		Fiches:        []vueFiche{construireVueFiche(donnees, l)},
	}
	return executer(vue)
}

// RendreLivret produit le HTML du livret d'une promotion : page de titre avec
// sommaire, puis les fiches dans l'ordre reçu.
func RendreLivret(donnees DonneesLivret, l *Libelles, etablissement string) ([]byte, error) {
	livret := &vueLivret{
		Formation: donnees.Formation,
		Promotion: donnees.Promotion,
		Annees:    plageAnnees(donnees.PromotionDebut, donnees.PromotionFin),
	}
	vue := vueDocument{
		L:             l,
		Titre:         l.Livret + " — " + donnees.Formation + " — " + donnees.Promotion,
		Etablissement: etablissement,
		Livret:        livret,
	}
	for _, fiche := range donnees.Fiches {
		vue.Fiches = append(vue.Fiches, construireVueFiche(fiche, l))
		// Sommaire : options puis périodes, dans l'ordre d'arrivée.
		if n := len(livret.Sommaire); n == 0 || livret.Sommaire[n-1].Option != fiche.Option {
			livret.Sommaire = append(livret.Sommaire, vueSommaireOption{Option: fiche.Option})
		}
		option := &livret.Sommaire[len(livret.Sommaire)-1]
		if n := len(option.Periodes); n == 0 || option.Periodes[n-1].Periode != fiche.Periode {
			option.Periodes = append(option.Periodes, vueSommairePeriode{Periode: fiche.Periode})
		}
		periode := &option.Periodes[len(option.Periodes)-1]
		periode.UEs = append(periode.UEs, fiche.UE.Nom)
	}
	return executer(vue)
}

func executer(vue vueDocument) ([]byte, error) {
	var sortie bytes.Buffer
	if err := gabarit.Execute(&sortie, vue); err != nil {
		return nil, fmt.Errorf("gabarit de la fiche : %w", err)
	}
	return sortie.Bytes(), nil
}

func construireVueFiche(d DonneesFiche, l *Libelles) vueFiche {
	annee := anneeScolaire(d.PeriodeDebut)
	vue := vueFiche{
		Formation:       d.Formation,
		Periode:         d.Periode,
		Annee:           annee,
		Nom:             d.UE.Nom,
		Ects:            nombre(float64(d.UE.Ects), l.Lang),
		NbEnseignements: len(d.UE.Matieres),
		Pages:           1 + len(d.UE.Matieres),
		PiedContexte:    d.Formation + " · " + d.Periode + " · " + annee,
	}

	// La description : sa traduction quand le document est traduit et qu'elle
	// existe, le français sinon — et la mention qui dit ce qui est servi.
	description := d.UE.Description
	if l.Traduit && nonBlanc(description) {
		var ligne *etatTraduction
		if t := d.UE.Traduction; t != nil {
			ligne = &etatTraduction{t.Ligne.Statut, t.Perimee, t.Ligne.TraduitLe.Time}
			description = traduitOuSource(t.Ligne.Description, description)
		}
		vue.MentionTraduction = mentionTraduction(l, ligne)
	}
	vue.Description = decouperTexte(description)

	// Chiffres clés : la structure fait référence — le volume encadré de l'UE
	// est la somme des matiere.heure, pas des ventilations. Le travail
	// personnel, lui, n'existe que dans le syllabus : somme des heures_perso,
	// 0 par défaut comme la maquette.
	var volume, perso float64
	for _, m := range d.UE.Matieres {
		volume += float64(m.Heure)
		if m.Fiche != nil && m.Fiche.HeuresPerso != nil {
			perso += *m.Fiche.HeuresPerso
		}
		vue.Matieres = append(vue.Matieres, vueMatiereLigne{
			Nom:   m.Nom,
			Heure: nombre(float64(m.Heure), l.Lang),
			Coeff: nombre(float64(m.Coeff), l.Lang),
		})
	}
	vue.VolumeEncadre = nombre(volume, l.Lang)
	vue.TravailPerso = nombre(perso, l.Lang)

	// Matrice : les blocs mobilisés avec toutes leurs compétences ; les
	// autres en une phrase ; aucune liaison du tout, une autre phrase.
	for _, b := range d.Blocs {
		if !b.Mobilise() {
			vue.AutresBlocs = true
			continue
		}
		bloc := vueBloc{Libelle: b.Libelle}
		if b.Code != nil && strings.TrimSpace(*b.Code) != "" {
			bloc.Code = *b.Code
		}
		for _, c := range b.Competences {
			bloc.Competences = append(bloc.Competences, vueCompetence{
				Code:         fmt.Sprintf("C%d", c.Ordre),
				Action:       c.Action,
				Enseignee:    c.Enseignee,
				MiseEnOeuvre: c.MiseEnOeuvre,
				Evaluee:      c.Evaluee,
			})
		}
		vue.BlocsMobilises = append(vue.BlocsMobilises, bloc)
	}
	vue.AucuneLiaison = len(vue.BlocsMobilises) == 0
	if vue.AucuneLiaison {
		vue.AutresBlocs = false
	}

	for i, m := range d.UE.Matieres {
		vue.PagesMatiere = append(vue.PagesMatiere, construireVuePageMatiere(m, i+2, l))
	}
	return vue
}

// ordreVentilation : les lignes d'heures dans l'ordre de la maquette ; le
// travail personnel ferme la série, hors total.
var ordreVentilation = []string{
	"heures_cours", "heures_cours_td", "heures_td", "heures_tp",
	"heures_projet", "heures_autonomie", "heures_controle", "heures_perso",
}

func construireVuePageMatiere(m MatiereFiche, numero int, l *Libelles) vuePageMatiere {
	page := vuePageMatiere{Numero: numero, Nom: m.Nom}
	f := m.Fiche
	if f == nil || f.Version == 0 {
		page.FicheAbsente = true
		return page
	}
	// Les rubriques : la traduction champ par champ quand le document est
	// traduit — un champ que la traduction laisse vide replie sur le français,
	// rien ne disparaît —, et la mention qui dit ce qui est servi. Une fiche
	// sans aucun texte (des heures seulement) n'a rien à traduire : pas de
	// mention.
	source := rubriques{f.Contexte, f.Prerequis, f.Objectifs, f.Activites, f.Evaluation, f.PlanCours, f.Ressources, f.DimensionSocioEnv}
	servi := source
	if l.Traduit && source.aDuTexte() {
		var ligne *etatTraduction
		if t := m.Traduction; t != nil {
			tl := t.Ligne
			ligne = &etatTraduction{tl.Statut, t.Perimee, tl.TraduitLe.Time}
			traduit := rubriques{tl.Contexte, tl.Prerequis, tl.Objectifs, tl.Activites, tl.Evaluation, tl.PlanCours, tl.Ressources, tl.DimensionSocioEnv}
			for i := range servi {
				servi[i] = traduitOuSource(traduit[i], source[i])
			}
		}
		page.MentionTraduction = mentionTraduction(l, ligne)
	}
	page.Contexte = decouperTexte(servi[0])
	page.Prerequis = decouperTexte(servi[1])
	page.Objectifs = decouperTexte(servi[2])
	page.Activites = decouperTexte(servi[3])
	page.Evaluation = decouperTexte(servi[4])
	page.PlanCours = decouperTexte(servi[5])
	page.Ressources = decouperTexte(servi[6])
	page.DimensionSocioEnv = decouperTexte(servi[7])

	valeurs := heuresVentilation(f)
	var total float64
	for _, cle := range ordreVentilation {
		v := valeurs[cle]
		if v == nil {
			continue
		}
		page.Heures = append(page.Heures, vueLigneHeures{Libelle: l.HeuresVentilation[cle], Valeur: nombre(*v, l.Lang)})
		if cle != "heures_perso" {
			total += *v
		}
	}
	page.AHeures = len(page.Heures) > 0
	page.TotalEncadre = nombre(total, l.Lang)
	// L'écart avec la structure, même formulation que l'écran : signalé, jamais
	// bloquant. Comparaison au centième, la précision de la colonne.
	if page.AHeures && math.Round(total*100) != math.Round(float64(m.Heure)*100) {
		page.Ecart = fmt.Sprintf(l.Ecart, nombre(total, l.Lang), nombre(float64(m.Heure), l.Lang))
	}
	// Une fiche écrite mais sans rien dedans : traitée comme absente.
	if !page.AHeures && len(page.Contexte)+len(page.Prerequis)+len(page.Objectifs)+len(page.Activites)+
		len(page.Evaluation)+len(page.PlanCours)+len(page.Ressources)+len(page.DimensionSocioEnv) == 0 {
		page.FicheAbsente = true
	}
	return page
}

// ── Traduction du contenu (lot 6) ────────────────────────────────────────────

// rubriques : les huit textes d'une fiche, dans l'ordre contexte, prérequis,
// objectifs, activités, évaluation, plan de cours, ressources, dimension
// socio-environnementale.
type rubriques [8]*string

func (r rubriques) aDuTexte() bool {
	for _, t := range r {
		if nonBlanc(t) {
			return true
		}
	}
	return false
}

func nonBlanc(t *string) bool { return t != nil && strings.TrimSpace(*t) != "" }

func traduitOuSource(traduit, source *string) *string {
	if nonBlanc(traduit) {
		return traduit
	}
	return source
}

// etatTraduction : ce que la mention a besoin de savoir d'une traduction.
type etatTraduction struct {
	Statut    string
	Perimee   bool
	TraduitLe time.Time
}

// mentionTraduction : la ligne discrète d'un document traduit — aucune
// absence n'est silencieuse. Pas de traduction : le français est servi, dit.
// Périmée (quel que soit le statut) : dit, avec la date de la traduction.
// Automatique non relue : dit. Relue et à jour : rien.
func mentionTraduction(l *Libelles, t *etatTraduction) string {
	switch {
	case t == nil:
		return l.MentionNonTraduit
	case t.Perimee:
		return fmt.Sprintf(l.MentionPerimee, t.TraduitLe.Format("2 January 2006"))
	case t.Statut == traduction.StatutRelue:
		return ""
	default:
		return l.MentionAutomatique
	}
}

// ── Aides de mise en forme ───────────────────────────────────────────────────

// nombre : sans décimale superflue (« 20 », « 17,5 » en français, « 17.5 » en
// anglais).
func nombre(v float64, lang string) string {
	s := strconv.FormatFloat(math.Round(v*100)/100, 'f', -1, 64)
	if lang == "fr" {
		s = strings.Replace(s, ".", ",", 1)
	}
	return s
}

// anneeScolaire : « 2025-2026 » depuis la date de début d'une période —
// septembre ouvre l'année scolaire ; avant août, la date appartient à
// l'année entamée l'automne précédent.
func anneeScolaire(debut time.Time) string {
	if debut.IsZero() {
		return ""
	}
	annee := debut.Year()
	if debut.Month() < time.August {
		annee--
	}
	return fmt.Sprintf("%d-%d", annee, annee+1)
}

// plageAnnees : « 2025-2028 » pour une promotion, depuis ses dates.
func plageAnnees(debut, fin time.Time) string {
	if debut.IsZero() {
		return ""
	}
	if fin.IsZero() || fin.Year() == debut.Year() {
		return strconv.Itoa(debut.Year())
	}
	return fmt.Sprintf("%d-%d", debut.Year(), fin.Year())
}

// decouperTexte : le texte d'une rubrique, tel que saisi dans un textarea ou
// importé du tiers, en paragraphes (séparés par une ligne vide) et en listes
// (lignes commençant par un tiret ou une puce — la forme la plus fréquente de
// l'export, 762 plans de cours sur 1 798). Rien d'autre n'est interprété.
// Vide ou blanc : aucun bloc, et la rubrique ne s'imprime pas.
func decouperTexte(texte *string) []blocTexte {
	if texte == nil {
		return nil
	}
	var blocs []blocTexte
	var courant *blocTexte
	fermer := func() {
		if courant != nil && len(courant.Lignes) > 0 {
			blocs = append(blocs, *courant)
		}
		courant = nil
	}
	for _, brute := range strings.Split(strings.ReplaceAll(*texte, "\r\n", "\n"), "\n") {
		ligne := strings.TrimSpace(brute)
		if ligne == "" {
			fermer()
			continue
		}
		puce, contenu := detacherPuce(ligne)
		if courant == nil || courant.Liste != puce {
			fermer()
			courant = &blocTexte{Liste: puce}
		}
		courant.Lignes = append(courant.Lignes, contenu)
	}
	fermer()
	return blocs
}

// detacherPuce : vrai et le reste de la ligne si elle commence par un
// marqueur de liste.
func detacherPuce(ligne string) (bool, string) {
	for _, marqueur := range []string{"- ", "-\t", "• ", "•\t", "* ", "*\t", "· ", "·\t", "– ", "—"} {
		if strings.HasPrefix(ligne, marqueur) {
			return true, strings.TrimLeftFunc(ligne[len(marqueur):], unicode.IsSpace)
		}
	}
	if len(ligne) > 1 && (ligne[0] == '-' || ligne[0] == '*') && !unicode.IsSpace(rune(ligne[1])) && !unicode.IsDigit(rune(ligne[1])) {
		// « -Item » sans espace : encore une puce, l'export en porte.
		return true, ligne[1:]
	}
	return false, ligne
}
