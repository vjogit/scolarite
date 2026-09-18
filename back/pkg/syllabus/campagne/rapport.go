package campagne

// Le rapport de la campagne et son comparatif. Le rapport est identique en
// simulation et en application — seul l'en-tête dit si la base a été écrite.
// Le comparatif met source et traduction côte à côte, rubrique par rubrique :
// c'est lui qu'on lit pour juger un modèle avant --apply. Un test lit la
// structure, pas le texte.

import (
	"fmt"
	"io"
	"strings"
	"time"
)

type Nature string

const (
	NatureFiche       Nature = "fiche"
	NatureDescription Nature = "description d'UE"
)

type Cause string

const (
	CauseFournisseur   Cause = "fournisseur indisponible"
	CauseSortieRefusee Cause = "sortie refusée par un garde-fou"
	CauseEcriture      Cause = "erreur d'écriture"
	CauseLecture       Cause = "erreur de lecture"
)

var ordreCauses = []Cause{CauseFournisseur, CauseSortieRefusee, CauseEcriture, CauseLecture}

type Compteur struct {
	Traduites      int // première traduction
	Retraduites    int // périmée, retraduite
	AJour          int // ignorée : l'empreinte est celle de la source
	SansTexte      int // ignorée : rien à traduire
	ReluesPerimees int // laissée : relue, périmée, sans --retraduire-relues
	Echecs         int
	NonTentes      int
}

type Ligne struct {
	Nature Nature
	Chemin string
	Detail string
}

type Echec struct {
	Ligne
	Cause Cause
}

type Paire struct {
	Champ, Source, Traduction string
}

type Comparaison struct {
	Nature       Nature
	Chemin       string
	Retraduction bool
	Paires       []Paire
}

type Rapport struct {
	Date             time.Time
	Apply            bool
	RetraduireRelues bool
	Limite           int
	Langue           string
	Modele           string
	Promotion        string

	Fiches       Compteur
	Descriptions Compteur

	ReluesPerimees []Ligne
	Echecs         []Echec
	NonTentes      []Ligne
	Comparatif     []Comparaison
}

func (r *Rapport) compteur(n Nature) *Compteur {
	if n == NatureFiche {
		return &r.Fiches
	}
	return &r.Descriptions
}

func (r *Rapport) TotalEchecs() int { return r.Fiches.Echecs + r.Descriptions.Echecs }

func (r *Rapport) mode() string {
	if r.Apply {
		return "APPLICATION — base écrite"
	}
	return "SIMULATION — traducteur appelé, aucune écriture"
}

// Ecrire rend le rapport texte.
func (r *Rapport) Ecrire(w io.Writer) error {
	var b strings.Builder
	fmt.Fprintf(&b, "Traduction du syllabus — %s\n", r.mode())
	fmt.Fprintf(&b, "Date : %s\nPromotion : %s\nLangue : %s\nTraducteur : %s\n", r.Date.Format("2006-01-02 15:04:05"), r.Promotion, r.Langue, r.Modele)
	fmt.Fprintf(&b, "--retraduire-relues : %v — --limite : %d\n\n", r.RetraduireRelues, r.Limite)

	ligne := func(nom string, c Compteur) {
		fmt.Fprintf(&b, "%-18s %4d traduite(s), %4d retraduite(s) (périmées), %4d à jour, %4d sans texte, %4d relue(s) périmée(s) laissée(s), %4d échec(s), %4d non tentée(s)\n",
			nom, c.Traduites, c.Retraduites, c.AJour, c.SansTexte, c.ReluesPerimees, c.Echecs, c.NonTentes)
	}
	ligne("Fiches :", r.Fiches)
	ligne("Descriptions d'UE :", r.Descriptions)

	if len(r.ReluesPerimees) > 0 {
		fmt.Fprintf(&b, "\n== Relues périmées, laissées en l'état (%d) — à reprendre à l'écran, ou --retraduire-relues ==\n", len(r.ReluesPerimees))
		for _, l := range r.ReluesPerimees {
			fmt.Fprintf(&b, "  [%s] %s\n", l.Nature, l.Chemin)
		}
	}
	for _, cause := range ordreCauses {
		var lignes []Echec
		for _, e := range r.Echecs {
			if e.Cause == cause {
				lignes = append(lignes, e)
			}
		}
		if len(lignes) == 0 {
			continue
		}
		fmt.Fprintf(&b, "\n== Échecs — %s (%d) ==\n", cause, len(lignes))
		for _, e := range lignes {
			fmt.Fprintf(&b, "  [%s] %s — %s\n", e.Nature, e.Chemin, e.Detail)
		}
	}
	if len(r.NonTentes) > 0 {
		fmt.Fprintf(&b, "\n== Non tentées (%d) ==\n", len(r.NonTentes))
		for _, l := range r.NonTentes {
			fmt.Fprintf(&b, "  [%s] %s — %s\n", l.Nature, l.Chemin, l.Detail)
		}
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// EcrireComparatif rend le comparatif en Markdown : une section par objet
// traduit, un tableau source | traduction par rubrique.
func (r *Rapport) EcrireComparatif(w io.Writer) error {
	var b strings.Builder
	fmt.Fprintf(&b, "# Comparatif de traduction — %s\n\n%s · %s · %s · %s\n", r.Promotion, r.Date.Format("2006-01-02 15:04"), r.Modele, r.Langue, r.mode())
	for _, c := range r.Comparatif {
		suffixe := ""
		if c.Retraduction {
			suffixe = " (retraduction)"
		}
		fmt.Fprintf(&b, "\n## %s — %s%s\n", c.Nature, c.Chemin, suffixe)
		for _, p := range c.Paires {
			fmt.Fprintf(&b, "\n### %s\n\n| Source (fr) | Traduction (%s) |\n|---|---|\n| %s | %s |\n", p.Champ, r.Langue, cellule(p.Source), cellule(p.Traduction))
		}
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// cellule : un texte multi-ligne dans une cellule de tableau Markdown.
func cellule(t string) string {
	t = strings.ReplaceAll(strings.TrimSpace(strings.ReplaceAll(t, "\r\n", "\n")), "|", "\\|")
	return strings.ReplaceAll(t, "\n", "<br>")
}
