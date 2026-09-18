package syllabus_test

// La fiche anglaise sert la traduction stockée (lot 6) : assertions sur le
// HTML du gabarit, sans base ni service. Traduction quand elle existe, repli
// français champ par champ sinon, et la mention qui dit ce qui est servi —
// aucune absence n'est silencieuse. La fiche française, elle, ne change pas.

import (
	"strings"
	"testing"
	"time"

	"cyb-react/pkg/syllabus"
	"cyb-react/pkg/syllabus/gen"
	"cyb-react/pkg/syllabus/traduction"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
)

const (
	mentionNonTraduit  = "Not yet translated — shown in the French original."
	mentionAutomatique = "Machine translation, not yet reviewed — the French original prevails."
	mentionPerimee     = "Translation of an earlier version of the French original (translated on 3 March 2026) — the French original prevails."
)

func compter(html, texte string) int { return strings.Count(html, texte) }

func traductionFiche(statut string, perimee bool) *syllabus.TraductionFiche {
	return &syllabus.TraductionFiche{
		Perimee: perimee,
		Ligne: gen.SyllabusMatiereTraduction{
			Version: 1, Langue: "en", Statut: statut,
			Contexte:  ptr("Software systems are complex."),
			TraduitLe: pgtype.Timestamptz{Time: time.Date(2026, time.March, 3, 10, 0, 0, 0, time.UTC), Valid: true},
			// Prérequis laissé vide par la traduction : repli sur le français.
		},
	}
}

func TestFicheTraduite_SertLaTraductionEtReplieParChamp(t *testing.T) {
	d := donneesMaquette()
	d.UE.Matieres[0].Traduction = traductionFiche(traduction.StatutRelue, false)
	html := rendre(t, d, "en")

	assert.Contains(t, html, "Software systems are complex.")
	assert.NotContains(t, html, "Les systèmes logiciels sont complexes.")
	assert.Contains(t, html, "Savoir concevoir un logiciel.", "un champ non traduit replie sur le français")
	// Relue et à jour : aucune mention pour cette matière ; la seconde matière
	// et la description, non traduites, le disent.
	assert.Equal(t, 2, compter(html, mentionNonTraduit))
	assert.NotContains(t, html, mentionAutomatique)
}

func TestFicheTraduite_Mentions(t *testing.T) {
	cas := []struct {
		nom      string
		t        *syllabus.TraductionFiche
		attendue string
	}{
		{"automatique à jour", traductionFiche(traduction.StatutAutomatique, false), mentionAutomatique},
		{"automatique périmée", traductionFiche(traduction.StatutAutomatique, true), mentionPerimee},
		{"relue périmée", traductionFiche(traduction.StatutRelue, true), mentionPerimee},
	}
	for _, c := range cas {
		d := donneesMaquette()
		d.UE.Matieres[0].Traduction = c.t
		assert.Equal(t, 1, compter(rendre(t, d, "en"), c.attendue), c.nom)
	}
}

func TestFicheTraduite_DescriptionUe(t *testing.T) {
	d := donneesMaquette()
	d.UE.Traduction = &syllabus.TraductionDescription{Ligne: gen.UniteEnseignementTraduction{
		Version: 1, Langue: "en", Statut: traduction.StatutAutomatique, Description: ptr("This module combines dependency management and UX."),
	}}
	html := rendre(t, d, "en")
	assert.Contains(t, html, "This module combines dependency management and UX.")
	assert.NotContains(t, html, "Ce module combine")
	assert.Equal(t, 1, compter(html, mentionAutomatique))
}

func TestFicheTraduite_RienATraduire_PasDeMention(t *testing.T) {
	// Une fiche qui ne porte que des heures et une UE sans description : il
	// n'y a pas de texte, donc rien à signaler.
	d := donneesMaquette()
	d.UE.Description = nil
	d.UE.Matieres = d.UE.Matieres[1:]
	d.UE.Matieres[0].Fiche.Contexte = nil
	assert.NotContains(t, rendre(t, d, "en"), mentionNonTraduit)
}

func TestFicheFrancaise_IgnoreLaTraduction(t *testing.T) {
	d := donneesMaquette()
	d.UE.Matieres[0].Traduction = traductionFiche(traduction.StatutAutomatique, true)
	html := rendre(t, d, "fr")
	assert.Contains(t, html, "Les systèmes logiciels sont complexes.")
	assert.NotContains(t, html, "Software systems")
	assert.NotContains(t, html, "French original")
}
