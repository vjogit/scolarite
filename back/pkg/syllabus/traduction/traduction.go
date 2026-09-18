// Package traduction porte la traduction d'un texte de syllabus du français
// vers l'anglais par un modèle de langage interchangeable (pkg/ia) : la
// consigne et le glossaire — versionnés ici, pas dans la configuration, pour
// que la même entrée donne la même sortie d'une machine à l'autre — et les
// garde-fous qui refusent une sortie inexploitable. Niveau texte seulement :
// ni base, ni HTTP ; le serveur (bouton « Traduire ») et le CLI de campagne
// (pkg/syllabus/campagne) passent tous deux par Traducteur.Traduire.
//
// La machine propose, le rédacteur dispose : une sortie qui passe les
// garde-fous n'est pas une traduction juste, c'est une traduction relisible.
package traduction

import (
	"context"
	_ "embed"
	"encoding/csv"
	"fmt"
	"strings"
	"unicode/utf8"

	"cyb-react/pkg/ia"
)

// Langues cibles admises. Une troisième langue = une entrée ici, sa consigne
// et son glossaire ; le schéma (langue en colonne) ne la ferme pas.
const LangueEn = "en"

func LangueAdmise(langue string) bool { return langue == LangueEn }

// Statuts d'une traduction stockée (chk_*_statut).
const (
	StatutAutomatique = "automatique"
	StatutRelue       = "relue"
)

//go:embed consigne.txt
var consigne string

//go:embed glossaire.csv
var glossaireCSV string

// Consigne : la consigne système complète, glossaire compris, en entier à
// chaque appel (il est court, et une sélection par occurrence ferait dépendre
// la sortie d'une heuristique de plus).
var Consigne = construireConsigne()

func construireConsigne() string {
	lignes, err := csv.NewReader(strings.NewReader(glossaireCSV)).ReadAll()
	if err != nil || len(lignes) < 2 {
		panic(fmt.Sprintf("glossaire embarqué illisible : %v", err))
	}
	var b strings.Builder
	b.WriteString(strings.TrimRight(consigne, "\n"))
	b.WriteString("\n")
	for _, l := range lignes[1:] {
		fmt.Fprintf(&b, "- %s → %s\n", l[0], l[1])
	}
	return b.String()
}

// ErreurSortie : le modèle a répondu, mais sa sortie est refusée par un
// garde-fou. Distincte de ia.ErreurIndisponible pour le rapport de campagne ;
// pour l'écran, les deux sont « pas de traduction » (503).
type ErreurSortie struct{ Motif string }

func (e *ErreurSortie) Error() string { return "sortie du traducteur refusée : " + e.Motif }

// Traducteur : un connecteur et la consigne du dépôt.
type Traducteur struct {
	Connecteur ia.Connecteur
}

func (t *Traducteur) Nom() string { return t.Connecteur.Nom() }

// Traduire rend la traduction d'un texte. Un texte vide ou blanc n'appelle
// personne et se rend tel quel.
func (t *Traducteur) Traduire(ctx context.Context, texte string) (string, error) {
	if strings.TrimSpace(texte) == "" {
		return texte, nil
	}
	sortie, err := t.Connecteur.Completer(ctx, Consigne, texte)
	if err != nil {
		return "", err
	}
	sortie = strings.TrimSpace(strings.ReplaceAll(sortie, "\r\n", "\n"))
	if err := Verifier(texte, sortie); err != nil {
		return "", err
	}
	return sortie, nil
}

// Bornes du rapport de longueur sortie/source (en caractères). L'anglais est
// un peu plus court que le français ; hors de ces bornes la sortie est un
// résumé, un refus, ou un texte accompagné de commentaires. Sous le plancher
// de longueur, le rapport ne dit rien (« TP » → « lab session »).
const (
	rapportMin      = 0.3
	rapportMax      = 3.0
	longueurPlanche = 40
)

// Verifier applique les garde-fous : sortie non vide, longueur plausible,
// même nombre de lignes à puce (le gabarit PDF découpe sur elles).
func Verifier(source, sortie string) error {
	if strings.TrimSpace(sortie) == "" {
		return &ErreurSortie{Motif: "sortie vide"}
	}
	ls, lt := utf8.RuneCountInString(strings.TrimSpace(source)), utf8.RuneCountInString(sortie)
	if ls >= longueurPlanche {
		if r := float64(lt) / float64(ls); r < rapportMin || r > rapportMax {
			return &ErreurSortie{Motif: fmt.Sprintf("longueur implausible (%d caractères pour %d)", lt, ls)}
		}
	}
	if ps, pt := compterPuces(source), compterPuces(sortie); ps != pt {
		return &ErreurSortie{Motif: fmt.Sprintf("%d ligne(s) à puce pour %d dans la source", pt, ps)}
	}
	return nil
}

func compterPuces(texte string) int {
	n := 0
	for _, l := range strings.Split(texte, "\n") {
		l = strings.TrimSpace(l)
		for _, m := range []string{"- ", "-\t", "• ", "•\t", "* ", "*\t", "· ", "·\t", "– ", "—"} {
			if strings.HasPrefix(l, m) {
				n++
				break
			}
		}
	}
	return n
}
