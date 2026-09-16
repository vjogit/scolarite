package legacy_test

// Tests d'intégration de l'import du legacy (lot 4), dans le style du
// domaine : fixture SeedStructureFixture (suffixe « legacy », que les CSV de
// testdata/ nomment), pool réel, aucune requête HTTP — l'import est un
// outil d'exploitation. Chaque test rejoue une passe complète sur la fixture
// et lit la structure du rapport, jamais son texte.
//
// Ils prouvent les sept décisions du lot : appariement par nom (espaces et
// casse), exceptions en fichier, refus d'écraser sans --force, continuer et
// rapporter (chaque cause de rejet a sa ligne), simulation sans écriture,
// idempotence (deux passes = même état, la seconde ne rapporte que des
// inchangés), et la fixture committée elle-même.

import (
	"bytes"
	"context"
	"testing"

	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/gen"
	"cyb-react/pkg/syllabus/legacy"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type structureLegacy struct {
	services.StructureFixture
	AgentID    int32
	Matiere2ID int32
	Ue6ID      int32
	Bloc1C2ID  int32
}

// seedLegacy complète la fixture partagée avec ce que les CSV attendent :
// matières et UE homonymes, UE nommée par son code, autre formation avec son
// bloc, fiche et matrice préexistantes pour les conflits, responsables à
// préserver.
func seedLegacy(t *testing.T, pool *pgxpool.Pool) structureLegacy {
	t.Helper()
	ctx := context.Background()
	s := structureLegacy{StructureFixture: services.SeedStructureFixture(t, pool, "legacy")}
	exec := func(query string, args ...any) int32 {
		t.Helper()
		var id int32
		require.NoError(t, pool.QueryRow(ctx, query, args...).Scan(&id), query)
		return id
	}
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public."user" (version, "firstName", "lastName", email, type_personne)
		 VALUES (1, 'Agent', 'Legacy', 'agent-legacy@test.invalid', 'AGENT') RETURNING id`).Scan(&s.AgentID))

	matiere := func(ueID int32, nom string, heure float32) int32 {
		return exec(`INSERT INTO matiere (name, version, heure, coeff, unite_enseignement_id) VALUES ($1, 1, $2, 1, $3) RETURNING id`, nom, heure, ueID)
	}
	ue := func(periodeID int32, nom string) int32 {
		return exec(`INSERT INTO unite_enseignement (name, version, ects, periode_id) VALUES ($1, 1, 3, $2) RETURNING id`, nom, periodeID)
	}

	// Période 1 : « UE 1 legacy » (fixture, « Matiere 1 legacy » 20 h) + le reste.
	s.Matiere2ID = matiere(s.UeID, "Matiere 2 legacy", 10)
	matiere(s.UeID, "Matiere 3 legacy", 5)
	ue52 := ue(s.PeriodeID, "FIX_5_2")
	matiere(ue52, "Reseaux", 30)
	matiere(ue52, "Trop", 1)
	ue(s.PeriodeID, "Double")
	ue(s.PeriodeID, "Double")
	ue55 := ue(s.PeriodeID, "UE 5 legacy")
	matiere(ue55, "Exc", 6)

	// Période 2 : « UE 6 legacy » déjà décrite, avec responsable, et « UE 62 legacy ».
	s.Ue6ID = ue(s.PeriodeAutre, "UE 6 legacy")
	_, err := pool.Exec(ctx, `UPDATE unite_enseignement SET description = 'Ancienne description', responsable_id = $1 WHERE id = $2`, s.AgentID, s.Ue6ID)
	require.NoError(t, err)
	matiere(s.Ue6ID, "Projet", 20)
	matiere(s.Ue6ID, "Projet", 20)
	matiere(s.Ue6ID, "Anglais", 27)
	matiere(s.Ue6ID, "Allemand", 20)
	ue62 := ue(s.PeriodeAutre, "UE 62 legacy")
	matiere(ue62, "M62", 4)

	// Référentiel de « Promo 1 legacy » : bloc 1 (C1, C2), bloc 2 (C1) ; et
	// « Promo 2 legacy », autre promotion de la même formation : bloc 1 (C1).
	bloc1 := exec(`INSERT INTO bloc_competence (promotion_id, ordre, libelle) VALUES ($1, 1, 'Bloc A') RETURNING id`, s.PromotionID)
	exec(`INSERT INTO competence (bloc_id, ordre, action) VALUES ($1, 1, 'A1') RETURNING id`, bloc1)
	s.Bloc1C2ID = exec(`INSERT INTO competence (bloc_id, ordre, action) VALUES ($1, 2, 'A2') RETURNING id`, bloc1)
	bloc2 := exec(`INSERT INTO bloc_competence (promotion_id, ordre, libelle) VALUES ($1, 2, 'Bloc B') RETURNING id`, s.PromotionID)
	exec(`INSERT INTO competence (bloc_id, ordre, action) VALUES ($1, 1, 'B1') RETURNING id`, bloc2)
	blocAutre := exec(`INSERT INTO bloc_competence (promotion_id, ordre, libelle) VALUES ($1, 1, 'Bloc autre') RETURNING id`, s.PromotionVide)
	exec(`INSERT INTO competence (bloc_id, ordre, action) VALUES ($1, 1, 'X1') RETURNING id`, blocAutre)

	// Préexistant : fiche de « Matiere 2 legacy » (version 1, responsable) et
	// matrice de « UE 6 legacy » (C2 du bloc 1, mise en œuvre).
	_, err = pool.Exec(ctx, `INSERT INTO syllabus_matiere (matiere_id, contexte, responsable_id) VALUES ($1, 'Ancien contexte', $2)`, s.Matiere2ID, s.AgentID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO ue_competence (ue_id, competence_id, enseignee, mise_en_oeuvre, evaluee) VALUES ($1, $2, false, true, false)`, s.Ue6ID, s.Bloc1C2ID)
	require.NoError(t, err)
	return s
}

func lireEntree(t *testing.T) *legacy.Entree {
	t.Helper()
	e, err := legacy.LireDossier("testdata", "")
	require.NoError(t, err)
	return e
}

func causes(r *legacy.Rapport, objet legacy.Objet) map[legacy.Cause]int {
	m := map[legacy.Cause]int{}
	for _, rj := range r.Rejets {
		if rj.Objet == objet {
			m[rj.Cause]++
		}
	}
	return m
}

func cles(r *legacy.Rapport, objet legacy.Objet, cause legacy.Cause) []string {
	var l []string
	for _, rj := range r.Rejets {
		if rj.Objet == objet && rj.Cause == cause {
			l = append(l, rj.Cle)
		}
	}
	return l
}

func typesSignalements(r *legacy.Rapport) map[string]int {
	m := map[string]int{}
	for _, s := range r.Signalements {
		m[s.Type]++
	}
	return m
}

// etat photographie ce que l'import peut écrire : fiches (contenu, version,
// responsable), descriptions d'UE et matrices.
func etat(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	var s string
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT (SELECT string_agg(matiere_id || ':' || version || ':' || coalesce(contexte, '') || ':' || coalesce(heures_cours::text, '') || ':' || coalesce(responsable_id::text, ''), '|' ORDER BY matiere_id) FROM syllabus_matiere)
		    || '#' || (SELECT string_agg(id || ':' || version || ':' || coalesce(description, '') || ':' || coalesce(responsable_id::text, ''), '|' ORDER BY id) FROM unite_enseignement)
		    || '#' || coalesce((SELECT string_agg(ue_id || ':' || competence_id || ':' || enseignee || mise_en_oeuvre || evaluee, '|' ORDER BY ue_id, competence_id) FROM ue_competence), '')`).Scan(&s))
	return s
}

// assertRejetsAttendus vérifie les rejets communs à toutes les passes sans
// --force : une ligne par cause, la fixture les provoque toutes.
func assertRejetsAttendus(t *testing.T, r *legacy.Rapport) {
	t.Helper()
	fiches := causes(r, legacy.ObjetFiche)
	assert.Equal(t, map[legacy.Cause]int{
		legacy.CauseCorrespondanceIntrouvable: 1,
		legacy.CauseUeInconnue:                1,
		legacy.CauseUeAmbigue:                 1,
		legacy.CauseMatiereInconnue:           1,
		legacy.CauseMatiereAmbigue:            1,
		legacy.CauseDoublonTiers:              2,
		legacy.CauseValeurHorsPlage:           1,
		legacy.CauseConflitNonForce:           1,
	}, fiches)
	assert.Equal(t, map[legacy.ClePeriode]int{
		{Annee: "2025-2026", Periode: "Semestre 7", Prefixe: "FIX"}:   1,
		{Annee: "2025-2026", Periode: "Semestre 5", Prefixe: "AUTRE"}: 1,
	}, r.PeriodesNonMappees)
	assert.Equal(t, 11, r.Fiches.Rejetes)
	assert.Equal(t, []string{"2025-2026 FIX_5_1 › Matiere 2 legacy"}, cles(r, legacy.ObjetFiche, legacy.CauseConflitNonForce))
	assert.Equal(t, []string{"2025-2026 FIX_5_2 › Trop"}, cles(r, legacy.ObjetFiche, legacy.CauseValeurHorsPlage))

	assert.Equal(t, map[legacy.Cause]int{legacy.CauseConflitNonForce: 1}, causes(r, legacy.ObjetDescription))
	assert.Equal(t, 1, r.SansContenu, "FIX_5_2 n'a pas de description")

	assert.Equal(t, map[legacy.Cause]int{
		legacy.CauseCompetenceHorsPosition: 2, // FIX_5_2 : position 3 absente, compétence sans code
		legacy.CauseBlocHorsPromotion:      1, // FIX_6_2 : bloc 30 mappé pour « Promo 2 legacy » seulement
		legacy.CauseUeAbsenteDesFiches:     1, // FIX_9_9
		legacy.CauseConflitNonForce:        1, // FIX_6_1 : matrice préexistante différente
	}, causes(r, legacy.ObjetMatrice))
	assert.Equal(t, 4, r.Matrices.Rejetes, "une matrice rejetée par UE, quel que soit le nombre de lignes en cause")
	assert.Equal(t, 1, r.HorsPerimetre, "le bloc transversal 1 n'est pas mappé")
	assert.Equal(t, 0, r.MatricesHorsPeriode)

	assert.Equal(t, map[string]int{
		"écart entre la ventilation encadrée et matiere.heure":      0,
		"heures « autre » du tiers, sans colonne — non importées":   0,
		"description d'UE non uniforme dans fiches.csv":             1,
		"liaisons du tiers contradictoires sur une même compétence": 1,
		"UE sans aucune liaison de compétence dans le tiers":        1,
	}, sansZeros(typesSignalements(r), "écart entre la ventilation encadrée et matiere.heure", "heures « autre » du tiers, sans colonne — non importées"))
}

// sansZeros complète la map avec des zéros pour les clés nommées, afin
// qu'une comparaison d'égalité reste lisible quand un type est absent.
func sansZeros(m map[string]int, cles ...string) map[string]int {
	for _, c := range cles {
		if _, ok := m[c]; !ok {
			m[c] = 0
		}
	}
	return m
}

func TestIntegration_ImportLegacy_SimulationSansEcriture(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	seedLegacy(t, pool)
	avant := etat(t, pool)

	r, err := legacy.Importer(context.Background(), pool, lireEntree(t), legacy.Options{Dossier: "testdata"})
	require.NoError(t, err)
	assert.True(t, r.Simulation)
	assert.Equal(t, 17, r.FichesLues)
	assert.Equal(t, 3, r.PeriodesRemplies, "S5 FIX, S6 FIX, S5 MAUVAIS")
	assert.Equal(t, 1, r.PeriodesVides, "S7 FIX")
	assert.Equal(t, 5, r.BlocsRemplis, "dont le bloc 19 mappé pour deux promotions")
	assert.Equal(t, 2, r.Exceptions)

	// Le rapport dit ce qu'une application ferait…
	assert.Equal(t, legacy.Compteur{Importes: 6, Inchanges: 0, Rejetes: 11}, r.Fiches)
	assert.Equal(t, legacy.Compteur{Importes: 3, Inchanges: 0, Rejetes: 1}, r.Descriptions)
	assert.Equal(t, legacy.Compteur{Importes: 1, Inchanges: 0, Rejetes: 4}, r.Matrices)
	assertRejetsAttendus(t, r)

	// … et la base n'a pas bougé.
	assert.Equal(t, avant, etat(t, pool))

	// Le texte se rend sans erreur et porte ses sections.
	var b bytes.Buffer
	require.NoError(t, r.Ecrire(&b))
	texte := b.String()
	assert.Contains(t, texte, "SIMULATION — aucune écriture")
	assert.Contains(t, texte, "== Rejets par cause ==")
	assert.Contains(t, texte, string(legacy.CauseUeAmbigue))
	assert.Contains(t, texte, "2025-2026 / Semestre 7 / FIX : 1 ligne(s)")
	assert.Contains(t, texte, "== Signalements (non bloquants) ==")
}

func TestIntegration_ImportLegacy_ApplicationEtIdempotence(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	s := seedLegacy(t, pool)
	ctx := context.Background()
	queries := gen.New(pool)

	r, err := legacy.Importer(ctx, pool, lireEntree(t), legacy.Options{Apply: true, Dossier: "testdata"})
	require.NoError(t, err)
	assert.False(t, r.Simulation)
	assert.Equal(t, legacy.Compteur{Importes: 6, Inchanges: 0, Rejetes: 11}, r.Fiches)
	assert.Equal(t, legacy.Compteur{Importes: 3, Inchanges: 0, Rejetes: 1}, r.Descriptions)
	assert.Equal(t, legacy.Compteur{Importes: 1, Inchanges: 0, Rejetes: 4}, r.Matrices)
	assertRejetsAttendus(t, r)

	// La fiche de « Matiere 1 legacy » : rubriques et ventilation du tiers,
	// version 1, pas d'heures perso, pas de responsable.
	fiche, err := queries.FetchSyllabusMatiereByMatiereID(ctx, s.MatiereID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), fiche.Version)
	assert.Equal(t, "Les systèmes évoluent vite.\nDeuxième paragraphe.", *fiche.Contexte)
	assert.Equal(t, "1. Introduction\n2. Pratique", *fiche.PlanCours)
	assert.Equal(t, "Aucun", *fiche.Prerequis)
	assert.Nil(t, fiche.DimensionSocioEnv)
	assert.Equal(t, 15.0, *fiche.HeuresCoursTd)
	assert.Equal(t, 4.0, *fiche.HeuresTp)
	assert.Equal(t, 1.0, *fiche.HeuresControle)
	assert.Nil(t, fiche.HeuresCours)
	assert.Nil(t, fiche.HeuresPerso)
	assert.Nil(t, fiche.ResponsableID)

	// Le conflit n'a rien écrit : « Matiere 2 legacy » garde son ancien contenu.
	conflit, err := queries.FetchSyllabusMatiereByMatiereID(ctx, s.Matiere2ID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), conflit.Version)
	assert.Equal(t, "Ancien contexte", *conflit.Contexte)

	// Les exceptions ont apparié « Matiere 3 legacy » et « UE 5 legacy ».
	var n int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM syllabus_matiere sm JOIN matiere m ON m.id = sm.matiere_id WHERE m.name IN ('Matiere 3 legacy', 'Exc')`).Scan(&n))
	assert.Equal(t, 2, n)

	// Descriptions : UE 1 importée (multiligne), UE 6 en conflit intacte avec son responsable.
	ue1, err := queries.FetchUniteEnseignementById(ctx, s.UeID)
	require.NoError(t, err)
	assert.Equal(t, "Pourquoi cette UE ? Pour poser les bases.\nSur deux lignes.", *ue1.Description)
	assert.Equal(t, int32(2), ue1.Version)
	assert.Equal(t, "UE 1 legacy", ue1.Name)
	ue6, err := queries.FetchUniteEnseignementById(ctx, s.Ue6ID)
	require.NoError(t, err)
	assert.Equal(t, "Ancienne description", *ue6.Description)
	assert.Equal(t, s.AgentID, *ue6.ResponsableID)

	// Matrice de « UE 1 legacy » : C1 (enseignée + évaluée), C2 (mise en
	// œuvre) du bloc 1, C1 (évaluée) du bloc 2 ; la liaison du bloc
	// transversal non mappé n'y est pas.
	matrice, err := queries.FetchUeCompetences(ctx, s.UeID)
	require.NoError(t, err)
	require.Len(t, matrice, 3)
	assert.Equal(t, [3]bool{true, false, true}, [3]bool{matrice[0].Enseignee, matrice[0].MiseEnOeuvre, matrice[0].Evaluee})
	assert.Equal(t, [3]bool{false, true, false}, [3]bool{matrice[1].Enseignee, matrice[1].MiseEnOeuvre, matrice[1].Evaluee})
	assert.Equal(t, [3]bool{false, false, true}, [3]bool{matrice[2].Enseignee, matrice[2].MiseEnOeuvre, matrice[2].Evaluee})
	// Celle de « UE 6 legacy » (conflit) est intacte.
	matrice6, err := queries.FetchUeCompetences(ctx, s.Ue6ID)
	require.NoError(t, err)
	require.Len(t, matrice6, 1)
	assert.Equal(t, s.Bloc1C2ID, matrice6[0].CompetenceID)

	// Seconde passe : même état, rien d'écrit, tout « inchangé », mêmes rejets.
	apres := etat(t, pool)
	r2, err := legacy.Importer(ctx, pool, lireEntree(t), legacy.Options{Apply: true, Dossier: "testdata"})
	require.NoError(t, err)
	assert.Equal(t, legacy.Compteur{Importes: 0, Inchanges: 6, Rejetes: 11}, r2.Fiches)
	assert.Equal(t, legacy.Compteur{Importes: 0, Inchanges: 3, Rejetes: 1}, r2.Descriptions)
	assert.Equal(t, legacy.Compteur{Importes: 0, Inchanges: 1, Rejetes: 4}, r2.Matrices)
	assertRejetsAttendus(t, r2)
	assert.Equal(t, apres, etat(t, pool), "deux passes = même état, versions comprises")
}

func TestIntegration_ImportLegacy_Force(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	s := seedLegacy(t, pool)
	ctx := context.Background()
	queries := gen.New(pool)

	// --force sans --apply : simulation, la base ne bouge pas, le rapport
	// montre ce qui serait remplacé (aucun conflit).
	avant := etat(t, pool)
	sim, err := legacy.Importer(ctx, pool, lireEntree(t), legacy.Options{Force: true, Dossier: "testdata"})
	require.NoError(t, err)
	assert.True(t, sim.Simulation)
	assert.Equal(t, legacy.Compteur{Importes: 7, Inchanges: 0, Rejetes: 10}, sim.Fiches)
	assert.Equal(t, legacy.Compteur{Importes: 4, Inchanges: 0, Rejetes: 0}, sim.Descriptions)
	assert.Equal(t, legacy.Compteur{Importes: 2, Inchanges: 0, Rejetes: 3}, sim.Matrices)
	assert.Empty(t, cles(sim, legacy.ObjetFiche, legacy.CauseConflitNonForce))
	assert.Equal(t, avant, etat(t, pool))

	// --force --apply : les trois conflits sont remplacés, les responsables
	// en place restent, les versions avancent.
	r, err := legacy.Importer(ctx, pool, lireEntree(t), legacy.Options{Apply: true, Force: true, Dossier: "testdata"})
	require.NoError(t, err)
	assert.Equal(t, legacy.Compteur{Importes: 7, Inchanges: 0, Rejetes: 10}, r.Fiches)
	assert.Equal(t, legacy.Compteur{Importes: 4, Inchanges: 0, Rejetes: 0}, r.Descriptions)
	assert.Equal(t, legacy.Compteur{Importes: 2, Inchanges: 0, Rejetes: 3}, r.Matrices)

	fiche, err := queries.FetchSyllabusMatiereByMatiereID(ctx, s.Matiere2ID)
	require.NoError(t, err)
	assert.Equal(t, int32(2), fiche.Version)
	assert.Equal(t, "Contexte de la matière 2", *fiche.Contexte)
	assert.Equal(t, 8.0, *fiche.HeuresCours)
	assert.Equal(t, s.AgentID, *fiche.ResponsableID, "le responsable n'est pas importé : celui en place reste")

	ue6, err := queries.FetchUniteEnseignementById(ctx, s.Ue6ID)
	require.NoError(t, err)
	assert.Equal(t, "Pourquoi l'UE 6", *ue6.Description)
	assert.Equal(t, s.AgentID, *ue6.ResponsableID)

	// Matrice de l'UE 6 : les deux liaisons du tiers (blocs 19 et 21, même
	// bloc scolarite) fusionnées en C1 enseignée + évaluée ; l'ancienne C2 a disparu.
	matrice6, err := queries.FetchUeCompetences(ctx, s.Ue6ID)
	require.NoError(t, err)
	require.Len(t, matrice6, 1)
	assert.NotEqual(t, s.Bloc1C2ID, matrice6[0].CompetenceID)
	assert.Equal(t, [3]bool{true, false, true}, [3]bool{matrice6[0].Enseignee, matrice6[0].MiseEnOeuvre, matrice6[0].Evaluee})
	assert.Equal(t, 1, typesSignalements(r)["liaisons du tiers contradictoires sur une même compétence"])

	// Signalements non bloquants sur ce qui est importé : l'écart d'heures de
	// « Matiere 2 legacy » (8 h pour 10 h) et ses heures « autre ».
	types := typesSignalements(r)
	assert.Equal(t, 1, types["écart entre la ventilation encadrée et matiere.heure"])
	assert.Equal(t, 1, types["heures « autre » du tiers, sans colonne — non importées"])

	// Relance avec --force : tout inchangé, aucune version ne bouge.
	apres := etat(t, pool)
	r2, err := legacy.Importer(ctx, pool, lireEntree(t), legacy.Options{Apply: true, Force: true, Dossier: "testdata"})
	require.NoError(t, err)
	assert.Equal(t, legacy.Compteur{Importes: 0, Inchanges: 7, Rejetes: 10}, r2.Fiches)
	assert.Equal(t, legacy.Compteur{Importes: 0, Inchanges: 4, Rejetes: 0}, r2.Descriptions)
	assert.Equal(t, legacy.Compteur{Importes: 0, Inchanges: 2, Rejetes: 3}, r2.Matrices)
	assert.Equal(t, apres, etat(t, pool))
}
