package legacy

// Le rapport de l'import : chiffres en tête, appariés/importés, rejets par
// cause, signalements non bloquants. Identique en simulation et en
// application — seul l'en-tête dit si la base a été touchée. Il s'écrit en
// texte, à côté de l'entrée ; un test lit la structure, pas le texte.

import (
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Cause d'un rejet. Les libellés sont ceux des sections du rapport.
type Cause string

const (
	CausePeriodeNonMappee           Cause = "période non mappée"
	CauseCorrespondanceIntrouvable  Cause = "correspondance de période introuvable"
	CauseUeInconnue                 Cause = "UE inconnue"
	CauseUeAmbigue                  Cause = "UE ambiguë"
	CauseMatiereInconnue            Cause = "matière inconnue"
	CauseMatiereAmbigue             Cause = "matière ambiguë"
	CauseDoublonTiers               Cause = "doublon dans fiches.csv"
	CauseValeurHorsPlage            Cause = "heures hors plage (> 999,99)"
	CauseConflitNonForce            Cause = "conflit non forcé"
	CauseUeAbsenteDesFiches         Cause = "UE absente de fiches.csv (période indéterminable)"
	CauseCorrespondanceBlocInvalide Cause = "correspondance de bloc introuvable"
	CauseCompetenceHorsPosition     Cause = "compétence hors position"
	CauseBlocHorsPromotion          Cause = "bloc d'une autre promotion que l'UE"
	CauseErreurEcriture             Cause = "erreur d'écriture"
)

// ordreCauses fixe l'ordre des sections du rapport.
var ordreCauses = []Cause{
	CausePeriodeNonMappee, CauseCorrespondanceIntrouvable, CauseUeInconnue, CauseUeAmbigue,
	CauseMatiereInconnue, CauseMatiereAmbigue, CauseDoublonTiers, CauseValeurHorsPlage,
	CauseUeAbsenteDesFiches, CauseCorrespondanceBlocInvalide, CauseCompetenceHorsPosition,
	CauseBlocHorsPromotion, CauseConflitNonForce, CauseErreurEcriture,
}

// Objet d'un rejet ou d'un signalement.
type Objet string

const (
	ObjetFiche       Objet = "fiche"
	ObjetDescription Objet = "description d'UE"
	ObjetMatrice     Objet = "matrice"
)

// Rejet : un objet non importé, avec sa cause. Ligne est celle du fichier
// d'entrée (fiches.csv pour une fiche, liaisons pour une matrice : la
// première ligne du groupe).
type Rejet struct {
	Objet  Objet
	Cause  Cause
	Ligne  int
	Cle    string // « 2025-2026 INFRES_5_1 › Matière »
	Detail string
}

// Signalement : non bloquant, l'import a eu lieu.
type Signalement struct {
	Type   string
	Ligne  int
	Cle    string
	Detail string
}

// Compteur d'un objet importable.
type Compteur struct {
	Importes  int // écrits (ou à écrire, en simulation)
	Inchanges int // déjà à l'état cible, aucune écriture
	Rejetes   int
}

// Rapport est le résultat d'une passe, simulation ou application.
type Rapport struct {
	Simulation bool
	Force      bool
	Dossier    string
	Date       time.Time

	FichesLues, LiaisonsLues, CompetencesTiers int
	PeriodesRemplies, PeriodesVides            int
	BlocsRemplis, BlocsVides                   int
	Exceptions                                 int

	Fiches              Compteur
	Descriptions        Compteur
	SansContenu         int // UE dont le tiers n'a pas de description
	Matrices            Compteur
	SansLigne           int // matrices dont toutes les liaisons sont hors périmètre
	HorsPerimetre       int // liaisons dont le bloc n'est pas mappé
	MatricesHorsPeriode int // matrices rejetées parce que leur période n'est pas mappée (comptées, non listées)

	// Périodes non mappées, agrégées : nombre de lignes de fiches.csv par clé.
	PeriodesNonMappees map[ClePeriode]int

	Rejets       []Rejet
	Signalements []Signalement
}

// rejeter liste un rejet et le compte sur son objet.
func (r *Rapport) rejeter(objet Objet, cause Cause, ligne int, cle, detail string) {
	r.lister(objet, cause, ligne, cle, detail)
	switch objet {
	case ObjetFiche:
		r.Fiches.Rejetes++
	case ObjetDescription:
		r.Descriptions.Rejetes++
	case ObjetMatrice:
		r.Matrices.Rejetes++
	}
}

// lister ajoute un rejet sans le compter : une matrice rejetée pour
// plusieurs liaisons se liste ligne à ligne mais ne compte qu'une fois.
func (r *Rapport) lister(objet Objet, cause Cause, ligne int, cle, detail string) {
	r.Rejets = append(r.Rejets, Rejet{Objet: objet, Cause: cause, Ligne: ligne, Cle: cle, Detail: detail})
}

func (r *Rapport) signaler(typ string, ligne int, cle, detail string) {
	r.Signalements = append(r.Signalements, Signalement{Type: typ, Ligne: ligne, Cle: cle, Detail: detail})
}

// TotalRejets compte les rejets listés et ceux agrégés par période non mappée.
func (r *Rapport) TotalRejets() int {
	total := len(r.Rejets) + r.MatricesHorsPeriode
	for _, n := range r.PeriodesNonMappees {
		total += n
	}
	return total
}

// RejetsParCause regroupe les rejets, dans l'ordre des sections.
func (r *Rapport) RejetsParCause() map[Cause][]Rejet {
	m := map[Cause][]Rejet{}
	for _, rj := range r.Rejets {
		m[rj.Cause] = append(m[rj.Cause], rj)
	}
	return m
}

// Ecrire rend le rapport en texte.
func (r *Rapport) Ecrire(w io.Writer) error {
	b := &strings.Builder{}
	mode := "APPLICATION — la base a été écrite"
	if r.Simulation {
		mode = "SIMULATION — aucune écriture"
	}
	fmt.Fprintf(b, "Import du syllabus tiers — %s\n", mode)
	fmt.Fprintf(b, "Dossier : %s\n", r.Dossier)
	fmt.Fprintf(b, "Date : %s\n", r.Date.Format("2006-01-02 15:04:05"))
	fmt.Fprintf(b, "Remplacement forcé (--force) : %s\n\n", ouiNon(r.Force))

	fmt.Fprintln(b, "== Entrée ==")
	fmt.Fprintf(b, "fiches.csv : %d ligne(s)\n", r.FichesLues)
	fmt.Fprintf(b, "liaisons_ue_competence.csv : %d ligne(s)\n", r.LiaisonsLues)
	fmt.Fprintf(b, "referentiel_tiers.csv : %d compétence(s)\n", r.CompetencesTiers)
	fmt.Fprintf(b, "correspondances de périodes : %d remplie(s), %d vide(s)\n", r.PeriodesRemplies, r.PeriodesVides)
	fmt.Fprintf(b, "correspondances de blocs : %d remplie(s), %d vide(s)\n", r.BlocsRemplis, r.BlocsVides)
	fmt.Fprintf(b, "exceptions d'appariement : %d\n\n", r.Exceptions)

	fmt.Fprintln(b, "== Totaux ==")
	ecrireCompteur(b, "Fiches de matière", r.Fiches)
	ecrireCompteur(b, "Descriptions d'UE", r.Descriptions)
	fmt.Fprintf(b, "  (UE sans description dans le tiers : %d)\n", r.SansContenu)
	ecrireCompteur(b, "Matrices de compétences", r.Matrices)
	fmt.Fprintf(b, "  (matrices sans aucune liaison dans le périmètre : %d ; liaisons hors périmètre, bloc non mappé : %d ; matrices d'une période non mappée : %d)\n", r.SansLigne, r.HorsPerimetre, r.MatricesHorsPeriode)
	fmt.Fprintf(b, "Rejets : %d — Signalements : %d\n\n", r.TotalRejets(), len(r.Signalements))

	fmt.Fprintln(b, "== Rejets par cause ==")
	parCause := r.RejetsParCause()
	if len(r.PeriodesNonMappees) > 0 {
		cles := make([]ClePeriode, 0, len(r.PeriodesNonMappees))
		for k := range r.PeriodesNonMappees {
			cles = append(cles, k)
		}
		sort.Slice(cles, func(i, j int) bool { return cles[i].String() < cles[j].String() })
		total := 0
		for _, k := range cles {
			total += r.PeriodesNonMappees[k]
		}
		fmt.Fprintf(b, "-- %s : %d ligne(s) de fiches.csv, par clé (année / période / préfixe)\n", CausePeriodeNonMappee, total)
		for _, k := range cles {
			fmt.Fprintf(b, "   %s : %d ligne(s)\n", k, r.PeriodesNonMappees[k])
		}
	}
	for _, cause := range ordreCauses {
		if cause == CausePeriodeNonMappee {
			continue
		}
		rejets := parCause[cause]
		if len(rejets) == 0 {
			continue
		}
		sort.SliceStable(rejets, func(i, j int) bool { return rejets[i].Ligne < rejets[j].Ligne })
		fmt.Fprintf(b, "-- %s : %d\n", cause, len(rejets))
		for _, rj := range rejets {
			fmt.Fprintf(b, "   ligne %d [%s] %s", rj.Ligne, rj.Objet, rj.Cle)
			if rj.Detail != "" {
				fmt.Fprintf(b, " — %s", rj.Detail)
			}
			fmt.Fprintln(b)
		}
	}
	if len(r.Rejets) == 0 && len(r.PeriodesNonMappees) == 0 {
		fmt.Fprintln(b, "aucun")
	}

	fmt.Fprintln(b, "\n== Signalements (non bloquants) ==")
	if len(r.Signalements) == 0 {
		fmt.Fprintln(b, "aucun")
	}
	parType := map[string][]Signalement{}
	var types []string
	for _, s := range r.Signalements {
		if _, ok := parType[s.Type]; !ok {
			types = append(types, s.Type)
		}
		parType[s.Type] = append(parType[s.Type], s)
	}
	for _, typ := range types {
		liste := parType[typ]
		sort.SliceStable(liste, func(i, j int) bool { return liste[i].Ligne < liste[j].Ligne })
		fmt.Fprintf(b, "-- %s : %d\n", typ, len(liste))
		for _, s := range liste {
			fmt.Fprintf(b, "   ligne %d %s — %s\n", s.Ligne, s.Cle, s.Detail)
		}
	}
	_, err := io.WriteString(w, b.String())
	return err
}

func ecrireCompteur(b *strings.Builder, libelle string, c Compteur) {
	fmt.Fprintf(b, "%s : %d importée(s), %d inchangée(s), %d rejetée(s)\n", libelle, c.Importes, c.Inchanges, c.Rejetes)
}

func ouiNon(v bool) string {
	if v {
		return "oui"
	}
	return "non"
}

// heures formate un volume horaire sans zéro superflu (15, 14.65).
func heures(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}
