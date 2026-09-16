package syllabus_test

// Le gabarit de la fiche (lot 5, décision 5) : les assertions vivent sur le
// HTML rendu, sans base ni service — sections, rubriques vides absentes, ligne
// d'écart, heures de référence (la structure fait foi), dérivation des blocs
// mobilisés, phrases des blocs non mobilisés et de l'UE sans liaison,
// libellés dans les deux langues, page de titre et sommaire du livret.

import (
	"strings"
	"testing"
	"time"

	"cyb-react/pkg/syllabus"
	"cyb-react/pkg/syllabus/gen"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ptr[T any](v T) *T { return &v }

// donneesMaquette : la fiche « Génie Logiciel » de la maquette — deux
// matières, l'une dont la ventilation est conforme (20 h), l'autre en écart
// (14 h de ventilation pour 16 h de structure), et un référentiel à trois
// blocs dont un seul est mobilisé.
func donneesMaquette() syllabus.DonneesFiche {
	return syllabus.DonneesFiche{
		Formation:    "INFRES",
		Promotion:    "INFRES 2025-2028",
		Option:       "Commun",
		Periode:      "Semestre 9",
		PeriodeDebut: time.Date(2025, time.September, 1, 0, 0, 0, 0, time.UTC),
		UE: syllabus.UEFiche{
			Nom:         "Génie Logiciel",
			Ects:        1,
			Description: ptr("Ce module combine gestion des dépendances et UX.\n\nEnsemble, ces cours préparent à des solutions solides."),
			Matieres: []syllabus.MatiereFiche{
				{
					Nom: "Cours gestion des dépendances", Heure: 20, Coeff: 1,
					Fiche: &gen.SyllabusMatiere{
						Version:        1,
						Contexte:       ptr("Les systèmes logiciels sont complexes."),
						Prerequis:      ptr("Savoir concevoir un logiciel."),
						Objectifs:      ptr("À la fin :\n-\tGérer les dépendances.\n- Évaluer les risques."),
						Activites:      ptr("Cours alternant avec des TP."),
						Evaluation:     ptr("TP noté."),
						PlanCours:      ptr("• Dépendances\n• Risques"),
						Ressources:     ptr("Support sur Campus."),
						HeuresCoursTd:  ptr(15.0),
						HeuresTp:       ptr(4.0),
						HeuresControle: ptr(1.0),
						HeuresPerso:    ptr(10.0),
					},
				},
				{
					Nom: "Expérience utilisateur", Heure: 16, Coeff: 2.5,
					Fiche: &gen.SyllabusMatiere{
						Version:        3,
						Contexte:       ptr("La qualité de l'expérience utilisateur compte."),
						HeuresCoursTd:  ptr(10.0),
						HeuresTp:       ptr(3.0),
						HeuresControle: ptr(1.0),
					},
				},
			},
		},
		Blocs: []syllabus.BlocFiche{
			{Ordre: 1, Code: ptr("INFRES-BC1"), Libelle: "Sécuriser et superviser", Competences: []syllabus.CompetenceFiche{
				{Ordre: 1, Action: "Analyser les risques", Enseignee: true},
				{Ordre: 2, Action: "Modéliser des solutions", Enseignee: true, Evaluee: true},
				{Ordre: 3, Action: "Déployer les solutions"},
			}},
			{Ordre: 2, Libelle: "Conduire des projets", Competences: []syllabus.CompetenceFiche{
				{Ordre: 1, Action: "Planifier"},
			}},
			{Ordre: 3, Code: ptr("INFRES-BC3"), Libelle: "Bloc sans compétence"},
		},
	}
}

func rendre(t *testing.T, d syllabus.DonneesFiche, lang string) string {
	t.Helper()
	l, ok := syllabus.LibellesPour(lang)
	require.True(t, ok)
	html, err := syllabus.RendreFiche(d, l, "École test")
	require.NoError(t, err)
	return string(html)
}

func TestGabarit_PageUE_StructureFaitReference(t *testing.T) {
	html := rendre(t, donneesMaquette(), "fr")

	// Bandeau et contexte : formation, période, année scolaire dérivée.
	assert.Contains(t, html, "<h1>Génie Logiciel</h1>")
	assert.Contains(t, html, "<strong>INFRES</strong>")
	assert.Contains(t, html, "Semestre 9 · 2025-2026")

	// Chiffres clés : ECTS de l'UE, volume encadré = somme des matiere.heure
	// (20 + 16 = 36, pas la somme des ventilations 20 + 14 = 34), travail
	// personnel = somme des heures_perso (10), deux enseignements.
	assert.Contains(t, html, `<div class="valeur">1</div><div class="libelle">ECTS</div>`)
	assert.Contains(t, html, `<div class="valeur">36 <small>h</small></div><div class="libelle">enseignement encadré</div>`)
	assert.Contains(t, html, `<div class="valeur">10 <small>h</small></div><div class="libelle">travail personnel</div>`)
	assert.Contains(t, html, `<div class="valeur">2</div><div class="libelle">enseignements</div>`)

	// Éléments constitutifs : heures et coeff de la structure, total de l'UE.
	assert.Contains(t, html, `<tr><td>Cours gestion des dépendances</td><td class="num">20</td><td class="num">1</td></tr>`)
	assert.Contains(t, html, `<tr><td>Expérience utilisateur</td><td class="num">16</td><td class="num">2,5</td></tr>`)
	assert.Contains(t, html, `<tr class="total"><td>Volume encadré de l&#39;UE</td><td class="num">36</td>`)

	// « Pourquoi cette UE ? » en deux paragraphes.
	assert.Contains(t, html, "<h2>Pourquoi cette UE ?</h2>")
	assert.Contains(t, html, "<p>Ce module combine gestion des dépendances et UX.</p>")
	assert.Contains(t, html, "<p>Ensemble, ces cours préparent à des solutions solides.</p>")

	// Trois pages : l'UE puis une par matière, numérotées.
	assert.Equal(t, 3, strings.Count(html, `<div class="page">`))
	assert.Contains(t, html, "Génie Logiciel · page 1/3")
	assert.Contains(t, html, "Génie Logiciel · page 2/3")
	assert.Contains(t, html, "Génie Logiciel · page 3/3")
	assert.Contains(t, html, `<span class="marque">École test</span>`)
}

func TestGabarit_Matrice_BlocsMobilisesEtPhrase(t *testing.T) {
	html := rendre(t, donneesMaquette(), "fr")

	// Le bloc 1 est mobilisé : rendu entier, ses trois compétences, codes dérivés.
	assert.Contains(t, html, `<span class="bloc-code">INFRES-BC1</span>Sécuriser et superviser`)
	assert.Contains(t, html, `<span class="comp-code">C1</span>Analyser les risques`)
	assert.Contains(t, html, `<span class="comp-code">C3</span>Déployer les solutions`)
	// Pastilles : C1 enseignée seule ; C2 enseignée et évaluée.
	assert.Contains(t, html, `<td><span class="comp-code">C1</span>Analyser les risques</td>
          <td class="etat"><span class="pastille"></span></td>
          <td class="etat"></td>
          <td class="etat"></td>`)
	assert.Contains(t, html, `<td><span class="comp-code">C2</span>Modéliser des solutions</td>
          <td class="etat"><span class="pastille"></span></td>
          <td class="etat"></td>
          <td class="etat"><span class="pastille"></span></td>`)
	// Les blocs 2 et 3 (aucune marque) n'apparaissent pas ; la phrase, si.
	assert.NotContains(t, html, "Conduire des projets")
	assert.NotContains(t, html, "Bloc sans compétence")
	assert.Contains(t, html, "Les autres blocs de compétences de la formation ne sont pas mobilisés par cette UE.")
	assert.NotContains(t, html, "Aucune compétence n&#39;est encore déclarée")
	// Sans légende à symboles : les colonnes portent le sens.
	assert.Contains(t, html, `<th class="etat">Enseignée</th>`)
	assert.Contains(t, html, `<th class="etat">Mise en œuvre</th>`)
	assert.Contains(t, html, `<th class="etat">Évaluée</th>`)
}

func TestGabarit_UESansLiaison_LaPhrase(t *testing.T) {
	d := donneesMaquette()
	for i := range d.Blocs {
		for j := range d.Blocs[i].Competences {
			d.Blocs[i].Competences[j] = syllabus.CompetenceFiche{Ordre: d.Blocs[i].Competences[j].Ordre, Action: d.Blocs[i].Competences[j].Action}
		}
	}
	html := rendre(t, d, "fr")
	assert.Contains(t, html, "Aucune compétence n&#39;est encore déclarée pour cette UE.")
	assert.NotContains(t, html, `<table class="matrice">`)
	assert.NotContains(t, html, "Les autres blocs de compétences")
	// La section reste présente, avec sa question : jamais d'absence silencieuse.
	assert.Contains(t, html, "Parmi les compétences visées par la formation")

	// Même chose sans aucun référentiel.
	d.Blocs = nil
	html = rendre(t, d, "en")
	assert.Contains(t, html, "No skill has been declared for this unit yet.")
}

func TestGabarit_PageMatiere_RubriquesEtHeures(t *testing.T) {
	html := rendre(t, donneesMaquette(), "fr")

	// Première matière : conforme (15 + 4 + 1 = 20 = matiere.heure), pas de
	// ligne d'écart ; les lignes nulles (Cours, TD, Projet, Autonomie)
	// absentes ; le travail personnel affiché hors total.
	assert.Contains(t, html, `<tr><td>Cours intégré (cours &#43; TD)</td><td class="num">15</td></tr>`)
	assert.Contains(t, html, `<tr><td>TP</td><td class="num">4</td></tr>`)
	assert.Contains(t, html, `<tr><td>Contrôles et soutenances</td><td class="num">1</td></tr>`)
	assert.Contains(t, html, `<tr><td>Travail personnel</td><td class="num">10</td></tr>`)
	assert.NotContains(t, html, `<tr><td>Cours</td>`)
	assert.NotContains(t, html, `<tr><td>Projet</td>`)
	assert.Contains(t, html, `<tr class="total"><td>Encadré</td><td class="num">20</td></tr>`)

	// Seconde matière : 14 h ventilées pour 16 h de structure → la ligne
	// d'écart, même formulation que l'écran.
	assert.Contains(t, html, `<tr class="total"><td>Encadré</td><td class="num">14</td></tr>`)
	assert.Contains(t, html, `<p class="note-bas ecart">Total encadré : 14 h — la structure prévoit 16 h</p>`)
	assert.Equal(t, 1, strings.Count(html, `class="note-bas ecart"`))

	// Rubriques : listes à puces reconnues (tiret-tabulation, tiret-espace,
	// puce), paragraphes sinon ; rubriques vides absentes.
	assert.Contains(t, html, "<h2>Contexte et enjeux de l&#39;enseignement</h2>")
	assert.Contains(t, html, "<h2>Prérequis</h2>")
	assert.Contains(t, html, "<p>À la fin :</p><ul><li>Gérer les dépendances.</li><li>Évaluer les risques.</li></ul>")
	assert.Contains(t, html, "<ul><li>Dépendances</li><li>Risques</li></ul>")
	assert.Contains(t, html, "<h2>Plan de cours</h2>")
	assert.Contains(t, html, "<h2>Ressources et références</h2>")
	// La seconde matière n'a ni prérequis, ni objectifs, ni plan : un seul de
	// chaque titre dans tout le document, et aucune dimension socio-env.
	assert.Equal(t, 1, strings.Count(html, "<h2>Prérequis</h2>"))
	assert.Equal(t, 1, strings.Count(html, "<h2>Plan de cours</h2>"))
	assert.NotContains(t, html, "Dimension socio-environnementale")
	assert.Contains(t, html, `<span class="matiere-sous">Expérience utilisateur</span>`)
}

func TestGabarit_MatiereSansFiche_LaPhrase(t *testing.T) {
	d := donneesMaquette()
	d.UE.Matieres[1].Fiche = nil
	d.UE.Matieres[0].Fiche = &gen.SyllabusMatiere{Version: 0}
	html := rendre(t, d, "fr")
	assert.Equal(t, 2, strings.Count(html, "Aucune fiche syllabus n&#39;est encore rédigée pour cet enseignement."))
	assert.NotContains(t, html, "Volumes horaires")
	// Le travail personnel reste à 0, comme la maquette.
	assert.Contains(t, html, `<div class="valeur">0 <small>h</small></div><div class="libelle">travail personnel</div>`)
}

func TestGabarit_Anglais_LibellesTraduitsContenuIntact(t *testing.T) {
	html := rendre(t, donneesMaquette(), "en")
	assert.Contains(t, html, `<html lang="en">`)
	assert.Contains(t, html, "<h2>Why this unit?</h2>")
	assert.Contains(t, html, "<h2>Components of the unit</h2>")
	assert.Contains(t, html, `<th class="etat">Taught</th>`)
	assert.Contains(t, html, `<th class="etat">Applied</th>`)
	assert.Contains(t, html, `<th class="etat">Assessed</th>`)
	assert.Contains(t, html, "The other skill blocks of the programme are not involved in this unit.")
	assert.Contains(t, html, `<p class="note-bas ecart">Supervised total: 14 h — the structure plans 16 h</p>`)
	assert.Contains(t, html, `<tr><td>Integrated course (lectures &#43; tutorials)</td><td class="num">15</td></tr>`)
	assert.Contains(t, html, "Génie Logiciel · page 1/3")
	// Le contenu saisi reste en français ; le séparateur décimal suit la langue.
	assert.Contains(t, html, "<p>Ce module combine gestion des dépendances et UX.</p>")
	assert.Contains(t, html, `<td class="num">2.5</td>`)
	assert.NotContains(t, html, "Pourquoi cette UE")
}

func TestGabarit_Livret_PageDeTitreEtSommaire(t *testing.T) {
	ue1 := donneesMaquette()
	ue2 := donneesMaquette()
	ue2.UE.Nom = "Réseaux"
	ue2.Periode = "Semestre 10"
	ue3 := donneesMaquette()
	ue3.UE.Nom = "Sécurité"
	ue3.Option = "SR"
	livret := syllabus.DonneesLivret{
		Formation:      "INFRES",
		Promotion:      "INFRES 2025-2028",
		PromotionDebut: time.Date(2025, time.September, 1, 0, 0, 0, 0, time.UTC),
		PromotionFin:   time.Date(2028, time.August, 31, 0, 0, 0, 0, time.UTC),
		Fiches:         []syllabus.DonneesFiche{ue1, ue2, ue3},
	}
	l, _ := syllabus.LibellesPour("fr")
	html, err := syllabus.RendreLivret(livret, l, "École test")
	require.NoError(t, err)
	s := string(html)

	assert.Contains(t, s, `<div class="page titre-livret">`)
	assert.Contains(t, s, "<h1>Livret syllabus</h1>")
	assert.Contains(t, s, `<div class="sous-titre">INFRES · INFRES 2025-2028 · 2025-2028</div>`)
	assert.Contains(t, s, "<h2>Sommaire</h2>")
	// Sommaire : option Commun avec ses deux périodes, puis option SR.
	assert.Contains(t, s, `<div class="option">Option · Commun</div>`)
	assert.Contains(t, s, `<div class="periode">Semestre 9</div>`)
	assert.Contains(t, s, `<div class="periode">Semestre 10</div>`)
	assert.Contains(t, s, `<div class="option">Option · SR</div>`)
	assert.Contains(t, s, "<li>Génie Logiciel</li>")
	assert.Contains(t, s, "<li>Réseaux</li>")
	assert.Contains(t, s, "<li>Sécurité</li>")
	assert.Equal(t, 2, strings.Count(s, `<div class="option">`))
	assert.Equal(t, 3, strings.Count(s, `<div class="periode">`))
	// Une page de titre + 3 fiches × 3 pages.
	assert.Equal(t, 10, strings.Count(s, `<div class="page`))
	assert.Contains(t, s, "Réseaux · page 1/3")
}

func TestGabarit_LangueInconnue(t *testing.T) {
	_, ok := syllabus.LibellesPour("de")
	assert.False(t, ok)
	_, ok = syllabus.LibellesPour("")
	assert.False(t, ok)
}

func TestGabarit_ContenuEchappe(t *testing.T) {
	d := donneesMaquette()
	d.UE.Description = ptr("<script>alert(1)</script> & co")
	html := rendre(t, d, "fr")
	assert.NotContains(t, html, "<script>alert(1)</script>")
	assert.Contains(t, html, "&lt;script&gt;alert(1)&lt;/script&gt; &amp; co")
}
