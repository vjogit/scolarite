// Package legacy importe le contenu du système syllabus tiers (lot 4) : les
// fiches des matières (rubriques, ventilation horaire), la description des
// UE et les liaisons UE ↔ compétence, depuis un export à plat en CSV.
//
// L'import n'écrit jamais dans les tables de structure : la structure fait
// référence, une UE ou une matière qui ne s'y apparie pas est rejetée et
// rapportée, jamais créée. Les écritures passent par les requêtes du domaine
// (upsert de la fiche, mise à jour syllabus de l'UE, RemplacerMatrice) pour
// en hériter les garanties. Ni responsable, ni ODD, ni groupe de matières,
// ni référentiel : le périmètre négatif du chantier s'applique.
//
// Ce fichier lit les cinq CSV et les correspondances ; il ne touche pas à la
// base. Toute colonne se cherche par son en-tête, jamais par sa position.
package legacy

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Noms des fichiers attendus dans le dossier d'entrée. Les correspondances
// se lisent d'abord sous leur nom rempli, puis sous le nom du gabarit livré
// avec l'export : l'opérateur remplit le gabarit en place ou le copie.
const (
	FichierFiches         = "fiches.csv"
	FichierLiaisons       = "liaisons_ue_competence.csv"
	FichierReferentiel    = "referentiel_tiers.csv"
	FichierPeriodes       = "correspondance_periodes.csv"
	FichierPeriodesGab    = "correspondance_periodes_gabarit.csv"
	FichierCompetences    = "correspondance_competences.csv"
	FichierCompetencesGab = "correspondance_competences_gabarit.csv"
	FichierExceptions     = "exceptions.csv"
)

// Les huit volumes horaires du tiers, dans l'ordre de ses colonnes. Les sept
// premiers ont une colonne dans syllabus_matiere ; « autre » n'en a pas
// (décision lot 1) : il se signale, il ne s'importe pas.
const (
	HCours = iota
	HCoursTd
	HTd
	HTp
	HProjet
	HControle
	HAutonomie
	HAutre
	nbHeures
)

var colonnesHeures = [nbHeures]string{
	"nbh_cours", "nbh_cours_td", "nbh_td", "nbh_tp", "nbh_projet", "nbh_controle", "nbh_autonomie", "nbh_autre",
}

// LigneFiche est une ligne de fiches.csv : une matière enseignée du tiers.
type LigneFiche struct {
	Ligne          int // numéro de ligne dans le fichier, tel qu'un éditeur l'affiche
	Annee          string
	Periode        string
	UeCode         string
	UeLibelle      string
	UeDescription  string
	MatiereLibelle string
	Heures         [nbHeures]*float64
	// Les huit rubriques, nil quand la cellule est vide.
	Contexte, SocioEnv, Prerequis, Objectifs, Activites, Evaluation, PlanCours, Ressources *string
}

// Prefixe est le préfixe de formation du code d'UE : ce qui précède le
// premier « _ » (INFRES_5_1 → INFRES, 2IAiail_iasd_10_1con → 2IAiail). C'est
// la règle qui a produit la colonne formation_prefixe_tiers du gabarit.
func (l LigneFiche) Prefixe() string { return Prefixe(l.UeCode) }

func Prefixe(ueCode string) string {
	if i := strings.Index(ueCode, "_"); i >= 0 {
		return ueCode[:i]
	}
	return ueCode
}

// LigneLiaison est une ligne de liaisons_ue_competence.csv : l'état tiers y
// est déjà traduit en trois booléens.
type LigneLiaison struct {
	Ligne        int
	Annee        string
	UeCode       string
	BlocID       string
	CompetenceID string
	EtatTiers    string
	Enseignee    bool
	MiseEnOeuvre bool
	Evaluee      bool
}

// CompetenceTiers est une ligne du référentiel tiers — lu comme appui de
// résolution seulement : la compétence se résout par sa position dans le
// bloc, lue dans son code (C5 → 5). Position 0 = code sans numéro.
type CompetenceTiers struct {
	BlocID       string
	CompetenceID string
	Code         string
	Position     int32
}

// CorrespondancePeriode est une ligne du fichier de correspondance des
// périodes : (année, période, préfixe) du tiers → chemin scolarite par nom.
// Une ligne dont les quatre noms sont vides est un périmètre non importé.
type CorrespondancePeriode struct {
	Ligne     int
	Annee     string
	Periode   string
	Prefixe   string
	Formation string
	Promotion string
	Option    string
	Cible     string // nom de la période scolarite
	Remplie   bool
}

// ClePeriode identifie une correspondance de période dans l'export.
type ClePeriode struct{ Annee, Periode, Prefixe string }

func (c CorrespondancePeriode) Cle() ClePeriode {
	return ClePeriode{c.Annee, c.Periode, c.Prefixe}
}

func (c ClePeriode) String() string {
	return fmt.Sprintf("%s / %s / %s", c.Annee, c.Periode, c.Prefixe)
}

// CorrespondanceBloc : bloc tiers → (promotion scolarite, ordre du bloc dans
// le référentiel de cette promotion). Le référentiel étant par promotion
// (16 septembre 2026), un bloc du tiers utilisé par plusieurs promotions
// occupe une ligne par promotion ; une ligne vide = liaisons de ce bloc hors
// périmètre.
type CorrespondanceBloc struct {
	Ligne     int
	BlocID    string
	Libelle   string
	Promotion string
	Ordre     int32
	Remplie   bool
}

// Exception force l'appariement d'une UE (matière vide) ou d'une matière du
// tiers sur un nom scolarite, quand la règle par nom ne suffit pas.
type Exception struct {
	Ligne          int
	UeCode         string
	MatiereLibelle string
	Name           string
}

// Entree est tout ce que l'import lit avant de toucher à la base.
type Entree struct {
	Fiches      []LigneFiche
	Liaisons    []LigneLiaison
	Referentiel map[string]CompetenceTiers // par identifiant de compétence tiers
	Periodes    []CorrespondancePeriode
	Blocs       []CorrespondanceBloc
	Exceptions  []Exception
}

// LireDossier lit les fichiers du dossier. exceptions est un chemin explicite
// ou vide (alors FichierExceptions dans le dossier, s'il existe).
func LireDossier(dossier string, exceptions string) (*Entree, error) {
	e := &Entree{}
	var err error
	if e.Fiches, err = lireFiches(filepath.Join(dossier, FichierFiches)); err != nil {
		return nil, err
	}
	if e.Liaisons, err = lireLiaisons(filepath.Join(dossier, FichierLiaisons)); err != nil {
		return nil, err
	}
	if e.Referentiel, err = lireReferentiel(filepath.Join(dossier, FichierReferentiel)); err != nil {
		return nil, err
	}
	if e.Periodes, err = lireCorrespondancePeriodes(premierExistant(dossier, FichierPeriodes, FichierPeriodesGab)); err != nil {
		return nil, err
	}
	if e.Blocs, err = lireCorrespondanceBlocs(premierExistant(dossier, FichierCompetences, FichierCompetencesGab)); err != nil {
		return nil, err
	}
	if exceptions == "" {
		exceptions = filepath.Join(dossier, FichierExceptions)
		if _, err := os.Stat(exceptions); errors.Is(err, os.ErrNotExist) {
			exceptions = ""
		}
	}
	if exceptions != "" {
		if e.Exceptions, err = lireExceptions(exceptions); err != nil {
			return nil, err
		}
	}
	return e, nil
}

func premierExistant(dossier string, noms ...string) string {
	for _, n := range noms {
		chemin := filepath.Join(dossier, n)
		if _, err := os.Stat(chemin); err == nil {
			return chemin
		}
	}
	return filepath.Join(dossier, noms[0])
}

// ── Lecture générique ──────────────────────────────────────────────────────

// enregistrement est une ligne CSV adressée par en-tête.
type enregistrement struct {
	ligne  int
	champs []string
	index  map[string]int
}

func (r enregistrement) val(colonne string) string {
	i, ok := r.index[colonne]
	if !ok || i >= len(r.champs) {
		return ""
	}
	return r.champs[i]
}

// lireCSV ouvre le fichier, exige les colonnes nommées et rend une ligne par
// enregistrement, numérotée par la ligne où l'enregistrement commence (les
// rubriques sont multilignes : c'est le seul numéro qu'un éditeur montre).
func lireCSV(chemin string, colonnes ...string) ([]enregistrement, error) {
	contenu, err := os.ReadFile(chemin)
	if err != nil {
		return nil, fmt.Errorf("%s : %w", filepath.Base(chemin), err)
	}
	contenu = bytes.TrimPrefix(contenu, []byte{0xEF, 0xBB, 0xBF})
	r := csv.NewReader(bytes.NewReader(contenu))
	r.FieldsPerRecord = -1
	entete, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("%s : en-tête illisible : %w", filepath.Base(chemin), err)
	}
	index := map[string]int{}
	for i, c := range entete {
		index[strings.TrimSpace(c)] = i
	}
	for _, c := range colonnes {
		if _, ok := index[c]; !ok {
			return nil, fmt.Errorf("%s : colonne « %s » absente de l'en-tête", filepath.Base(chemin), c)
		}
	}
	var lignes []enregistrement
	for {
		champs, err := r.Read()
		if errors.Is(err, io.EOF) {
			return lignes, nil
		}
		if err != nil {
			return nil, fmt.Errorf("%s : %w", filepath.Base(chemin), err)
		}
		if len(champs) < len(entete) {
			ligne, _ := r.FieldPos(0)
			return nil, fmt.Errorf("%s ligne %d : %d colonnes, %d attendues", filepath.Base(chemin), ligne, len(champs), len(entete))
		}
		ligne, _ := r.FieldPos(0)
		lignes = append(lignes, enregistrement{ligne: ligne, champs: champs, index: index})
	}
}

// texte rend nil pour une cellule vide (après trim), sinon la cellule telle
// quelle — les retours à la ligne des rubriques sont conservés.
func texte(v string) *string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return &v
}

func nombre(fichier string, ligne int, colonne, v string) (*float64, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil, nil
	}
	f, err := strconv.ParseFloat(strings.ReplaceAll(v, ",", "."), 64)
	if err != nil {
		return nil, fmt.Errorf("%s ligne %d : %s « %s » n'est pas un nombre", fichier, ligne, colonne, v)
	}
	return &f, nil
}

func booleen(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "vrai", "oui", "t":
		return true
	}
	return false
}

// ── Les cinq fichiers ──────────────────────────────────────────────────────

func lireFiches(chemin string) ([]LigneFiche, error) {
	colonnes := []string{"annee", "periode", "ue_code", "ue_libelle", "ue_description", "matiere_libelle",
		"contexte", "socio_env", "prerequis", "objectifs", "activites", "evaluation", "plan_de_cours", "ressources"}
	colonnes = append(colonnes, colonnesHeures[:]...)
	lignes, err := lireCSV(chemin, colonnes...)
	if err != nil {
		return nil, err
	}
	fiches := make([]LigneFiche, 0, len(lignes))
	for _, l := range lignes {
		f := LigneFiche{
			Ligne:          l.ligne,
			Annee:          strings.TrimSpace(l.val("annee")),
			Periode:        strings.TrimSpace(l.val("periode")),
			UeCode:         strings.TrimSpace(l.val("ue_code")),
			UeLibelle:      l.val("ue_libelle"),
			UeDescription:  l.val("ue_description"),
			MatiereLibelle: l.val("matiere_libelle"),
			Contexte:       texte(l.val("contexte")),
			SocioEnv:       texte(l.val("socio_env")),
			Prerequis:      texte(l.val("prerequis")),
			Objectifs:      texte(l.val("objectifs")),
			Activites:      texte(l.val("activites")),
			Evaluation:     texte(l.val("evaluation")),
			PlanCours:      texte(l.val("plan_de_cours")),
			Ressources:     texte(l.val("ressources")),
		}
		for i, c := range colonnesHeures {
			if f.Heures[i], err = nombre(FichierFiches, l.ligne, c, l.val(c)); err != nil {
				return nil, err
			}
		}
		fiches = append(fiches, f)
	}
	return fiches, nil
}

func lireLiaisons(chemin string) ([]LigneLiaison, error) {
	lignes, err := lireCSV(chemin, "annee", "ue_code", "bloc_id", "competence_id", "etat_tiers", "enseignee", "mise_en_oeuvre", "evaluee")
	if err != nil {
		return nil, err
	}
	liaisons := make([]LigneLiaison, 0, len(lignes))
	for _, l := range lignes {
		liaisons = append(liaisons, LigneLiaison{
			Ligne:        l.ligne,
			Annee:        strings.TrimSpace(l.val("annee")),
			UeCode:       strings.TrimSpace(l.val("ue_code")),
			BlocID:       strings.TrimSpace(l.val("bloc_id")),
			CompetenceID: strings.TrimSpace(l.val("competence_id")),
			EtatTiers:    strings.TrimSpace(l.val("etat_tiers")),
			Enseignee:    booleen(l.val("enseignee")),
			MiseEnOeuvre: booleen(l.val("mise_en_oeuvre")),
			Evaluee:      booleen(l.val("evaluee")),
		})
	}
	return liaisons, nil
}

var codeCompetence = regexp.MustCompile(`^[cC]\s*0*([1-9][0-9]*)$`)

func lireReferentiel(chemin string) (map[string]CompetenceTiers, error) {
	lignes, err := lireCSV(chemin, "bloc_id", "competence_id", "competence_code")
	if err != nil {
		return nil, err
	}
	ref := make(map[string]CompetenceTiers, len(lignes))
	for _, l := range lignes {
		c := CompetenceTiers{
			BlocID:       strings.TrimSpace(l.val("bloc_id")),
			CompetenceID: strings.TrimSpace(l.val("competence_id")),
			Code:         strings.TrimSpace(l.val("competence_code")),
		}
		if m := codeCompetence.FindStringSubmatch(c.Code); m != nil {
			n, _ := strconv.Atoi(m[1])
			c.Position = int32(n)
		}
		if _, doublon := ref[c.CompetenceID]; doublon {
			return nil, fmt.Errorf("%s ligne %d : compétence %s en double", FichierReferentiel, l.ligne, c.CompetenceID)
		}
		ref[c.CompetenceID] = c
	}
	return ref, nil
}

func lireCorrespondancePeriodes(chemin string) ([]CorrespondancePeriode, error) {
	lignes, err := lireCSV(chemin, "annee_tiers", "periode_tiers", "formation_prefixe_tiers", "formation_name", "promotion_name", "option_name", "periode_name")
	if err != nil {
		return nil, err
	}
	nom := filepath.Base(chemin)
	corr := make([]CorrespondancePeriode, 0, len(lignes))
	vues := map[ClePeriode]int{}
	for _, l := range lignes {
		c := CorrespondancePeriode{
			Ligne:     l.ligne,
			Annee:     strings.TrimSpace(l.val("annee_tiers")),
			Periode:   strings.TrimSpace(l.val("periode_tiers")),
			Prefixe:   strings.TrimSpace(l.val("formation_prefixe_tiers")),
			Formation: strings.TrimSpace(l.val("formation_name")),
			Promotion: strings.TrimSpace(l.val("promotion_name")),
			Option:    strings.TrimSpace(l.val("option_name")),
			Cible:     strings.TrimSpace(l.val("periode_name")),
		}
		remplis := 0
		for _, v := range []string{c.Formation, c.Promotion, c.Option, c.Cible} {
			if v != "" {
				remplis++
			}
		}
		switch remplis {
		case 0:
		case 4:
			c.Remplie = true
		default:
			return nil, fmt.Errorf("%s ligne %d : correspondance incomplète (%d nom(s) sur 4) — remplir les quatre noms ou aucun", nom, l.ligne, remplis)
		}
		if precedente, ok := vues[c.Cle()]; ok {
			return nil, fmt.Errorf("%s ligne %d : la clé %s est déjà à la ligne %d", nom, l.ligne, c.Cle(), precedente)
		}
		vues[c.Cle()] = l.ligne
		corr = append(corr, c)
	}
	return corr, nil
}

func lireCorrespondanceBlocs(chemin string) ([]CorrespondanceBloc, error) {
	lignes, err := lireCSV(chemin, "bloc_id_tiers", "bloc_libelle_tiers", "promotion_name_scolarite", "bloc_ordre_scolarite")
	if err != nil {
		return nil, err
	}
	nom := filepath.Base(chemin)
	corr := make([]CorrespondanceBloc, 0, len(lignes))
	vus := map[string]int{}
	for _, l := range lignes {
		c := CorrespondanceBloc{
			Ligne:     l.ligne,
			BlocID:    strings.TrimSpace(l.val("bloc_id_tiers")),
			Libelle:   strings.TrimSpace(l.val("bloc_libelle_tiers")),
			Promotion: strings.TrimSpace(l.val("promotion_name_scolarite")),
		}
		ordre := strings.TrimSpace(l.val("bloc_ordre_scolarite"))
		switch {
		case c.Promotion == "" && ordre == "":
		case c.Promotion != "" && ordre != "":
			n, err := strconv.Atoi(ordre)
			if err != nil || n <= 0 {
				return nil, fmt.Errorf("%s ligne %d : ordre « %s » invalide (entier positif attendu)", nom, l.ligne, ordre)
			}
			c.Ordre = int32(n)
			c.Remplie = true
		default:
			return nil, fmt.Errorf("%s ligne %d : correspondance incomplète — remplir promotion et ordre, ou aucun des deux", nom, l.ligne)
		}
		// Unicité par (bloc tiers, promotion) : un même bloc revient une fois
		// par promotion, jamais deux fois pour la même.
		cle := c.BlocID + "\x00" + Normaliser(c.Promotion)
		if precedente, ok := vus[cle]; ok {
			return nil, fmt.Errorf("%s ligne %d : le bloc %s est déjà à la ligne %d pour la promotion « %s »", nom, l.ligne, c.BlocID, precedente, c.Promotion)
		}
		vus[cle] = l.ligne
		corr = append(corr, c)
	}
	return corr, nil
}

func lireExceptions(chemin string) ([]Exception, error) {
	lignes, err := lireCSV(chemin, "ue_code_tiers", "matiere_libelle_tiers", "name_scolarite")
	if err != nil {
		return nil, err
	}
	nom := filepath.Base(chemin)
	exc := make([]Exception, 0, len(lignes))
	for _, l := range lignes {
		e := Exception{
			Ligne:          l.ligne,
			UeCode:         strings.TrimSpace(l.val("ue_code_tiers")),
			MatiereLibelle: l.val("matiere_libelle_tiers"),
			Name:           strings.TrimSpace(l.val("name_scolarite")),
		}
		if e.UeCode == "" || e.Name == "" {
			return nil, fmt.Errorf("%s ligne %d : ue_code_tiers et name_scolarite sont requis", nom, l.ligne)
		}
		exc = append(exc, e)
	}
	return exc, nil
}
