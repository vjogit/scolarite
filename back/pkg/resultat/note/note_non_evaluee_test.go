package note_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"cyb-react/pkg/resultat/note/gen"
)

// Un contrôle non évalué prive l'élève de note à la matière, puis à l'UE, puis
// de GPA sur la période. La branche N.E. n'était couverte par aucun test — ni
// ici, ni côté jury — et elle était fausse à deux niveaux sur trois.
//
// Le défaut tenait à `SUM` : PostgreSQL écarte les NULL du numérateur mais
// garde leur coefficient au dénominateur. Une UE dont une matière n'avait pas
// de moyenne se calculait donc sur un dénominateur complet et un numérateur
// amputé. La fixture ci-dessous est bâtie pour rendre l'écart criant : l'élève
// est évalué 16 dans sa seule matière notée, et l'ancienne requête affichait
// 5.33.

type fixtureNE struct {
	periodeID, ueID         int32
	matiereNotee, matiereNE int32
	userID                  int32
}

// creerFixtureNonEvaluee bâtit une UE de deux matières de coefficients 2 et 1 :
// la première non évaluée, la seconde notée 16.
func creerFixtureNonEvaluee(t *testing.T, ctx context.Context, tx pgx.Tx) fixtureNE {
	t.Helper()

	var f fixtureNE
	var formationID, promotionID, optionID int32

	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Formation N.E.') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	echelleGpa := []float32{4, 3.5, 3, 2.5, 2, 0}
	echelle := []float32{16, 14, 12, 10, 8}
	err = tx.QueryRow(ctx, `
		INSERT INTO public.promotion (name, formation_id, debut, fin, echelle_gpa, echelle, bareme,
		                              matiere_eliminatoire, value_matiere_eliminatoire)
		VALUES ($1, $2, $3, $4, $5, $6, 20, true, 6) RETURNING id`,
		"Promo N.E.", formationID, time.Now(), time.Now().AddDate(1, 0, 0), echelleGpa, echelle).Scan(&promotionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Option N.E.', $1) RETURNING id`,
		promotionID).Scan(&optionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Semestre N.E.', $1, $2, $3) RETURNING id`,
		time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&f.periodeID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE N.E.', 6, $1) RETURNING id`,
		f.periodeID).Scan(&f.ueID)
	require.NoError(t, err)

	// Coefficient 2 sur la matière non évaluée : c'est la part qui restait au
	// dénominateur et écrasait le résultat.
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Matière non évaluée', 2.0, 20, $1) RETURNING id`,
		f.ueID).Scan(&f.matiereNE)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Matière notée', 1.0, 10, $1) RETURNING id`,
		f.ueID).Scan(&f.matiereNotee)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ('Chloé', 'NonEvaluee', 'chloe.ne@test.com', ARRAY['ELEVE']) RETURNING id`).Scan(&f.userID)
	require.NoError(t, err)

	var ctrlNE, ctrlNote int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Partiel', 1.0, false, $1) RETURNING id`,
		f.matiereNE).Scan(&ctrlNE)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('TP', 1.0, false, $1) RETURNING id`,
		f.matiereNotee).Scan(&ctrlNote)
	require.NoError(t, err)

	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (NULL, true, false, $1, $2)`,
		f.userID, ctrlNE)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (16, false, false, $1, $2)`,
		f.userID, ctrlNote)
	require.NoError(t, err)

	return f
}

func TestNonEvaluee_PriveDeNoteAuxTroisNiveaux(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)
	f := creerFixtureNonEvaluee(t, ctx, tx)

	t.Run("la matière non évaluée n'a pas de note", func(t *testing.T) {
		notes, err := queries.FetchNotesByMatiereID(ctx, f.matiereNE)
		require.NoError(t, err)
		require.Len(t, notes, 1)
		require.Nil(t, notes[0].Note, "une matière non évaluée ne vaut aucune note")
	})

	t.Run("la matière évaluée garde la sienne", func(t *testing.T) {
		notes, err := queries.FetchNotesByMatiereID(ctx, f.matiereNotee)
		require.NoError(t, err)
		require.Len(t, notes, 1)
		require.NotNil(t, notes[0].Note)
		require.Equal(t, float64(16), *notes[0].Note)
	})

	t.Run("l'UE n'a pas de note et ne dilue pas la matière évaluée", func(t *testing.T) {
		stats, err := queries.GetUeStats(ctx, f.ueID)
		require.NoError(t, err)
		require.Len(t, stats, 1)
		require.Nil(t, stats[0].Note,
			"l'UE ne doit pas valoir (16×1)/(2+1) = 5.33 : le dénominateur compterait une matière dont le numérateur manque")
		require.Equal(t, "N.E.", stats[0].GradeLettre)
		require.Nil(t, stats[0].AMatiereEliminatoire,
			"sans moyenne complète on ne peut pas affirmer qu'aucune matière n'est éliminatoire")
	})

	t.Run("la période ne donne pas de GPA", func(t *testing.T) {
		// Le GPA vient du relevé de jury : sans délibération, il n'existe pas.
		// Et un dossier non évalué ne peut pas être délibéré — le refus est
		// vérifié par TestJuryV5_DossierIncompletEstDetectable.
		gpa, err := queries.FetchGpaDelibereByPeriodeID(ctx, f.periodeID)
		require.NoError(t, err)
		require.Len(t, gpa, 1)
		require.Nil(t, gpa[0].Note)
		require.False(t, gpa[0].Delibere,
			"l'élève apparaît sur la période mais n'a pas été délibéré")
	})
}

// Le classement de la période trie par GPA décroissant. En SQL, `DESC` place
// les NULL en tête : sans `NULLS LAST`, un élève sans GPA — non délibéré, ou
// délibéré sans ECTS — prendrait la première place du classement.
func TestGpaDelibere_SansGpaNeRemontePasEnTeteDuClassement(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)
	f := creerFixtureNonEvaluee(t, ctx, tx)

	// Une camarade évaluée dans les deux matières, et délibérée.
	var autreID int32
	err := tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ('Alice', 'Evaluee', 'alice.ev@test.com', ARRAY['ELEVE']) RETURNING id`).Scan(&autreID)
	require.NoError(t, err)

	rows, err := tx.Query(ctx, `SELECT c.id FROM public.controle c
		JOIN public.matiere m ON m.id = c.matiere_id WHERE m.unite_enseignement_id = $1`, f.ueID)
	require.NoError(t, err)
	var controles []int32
	for rows.Next() {
		var id int32
		require.NoError(t, rows.Scan(&id))
		controles = append(controles, id)
	}
	rows.Close()
	require.Len(t, controles, 2)

	for _, c := range controles {
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (12, false, false, $1, $2)`,
			autreID, c)
		require.NoError(t, err)
	}

	// Délibération d'Alice : grade C, gpa_index 3, sur les 6 ECTS de l'UE.
	_, err = tx.Exec(ctx, `INSERT INTO public.jury_result (user_id, periode_id, unite_enseignement_id, grade, gpa_index, ects, compte_cumul)
		VALUES ($1, $2, $3, 'C', 3, 6, true)`, autreID, f.periodeID, f.ueID)
	require.NoError(t, err)

	gpa, err := queries.FetchGpaDelibereByPeriodeID(ctx, f.periodeID)
	require.NoError(t, err)
	require.Len(t, gpa, 2)

	require.Equal(t, autreID, gpa[0].UserID, "l'élève délibérée doit passer devant")
	require.True(t, gpa[0].Delibere)
	require.NotNil(t, gpa[0].Note)
	require.Equal(t, float64(3), *gpa[0].Note, "echelle_gpa[3] = 3, sur une seule UE")

	require.Equal(t, f.userID, gpa[1].UserID)
	require.False(t, gpa[1].Delibere)
	require.Nil(t, gpa[1].Note)
}

// Une matière sans aucune note pour l'élève signifie qu'il ne la suit pas — une
// UE peut réunir une matière pour les développeurs et une pour les réseaux. Son
// coefficient ne doit alors peser sur rien, et l'absence ne vaut pas N.E.
func TestMatiereNonSuivie_ExclueSansAnnulerLUe(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)
	f := creerFixtureNonEvaluee(t, ctx, tx)

	// Cet élève ne suit que la matière notée : aucune ligne sur l'autre.
	var devID int32
	err := tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ('David', 'Dev', 'david.dev@test.com', ARRAY['ELEVE']) RETURNING id`).Scan(&devID)
	require.NoError(t, err)

	var ctrlNote int32
	err = tx.QueryRow(ctx, `SELECT c.id FROM public.controle c WHERE c.matiere_id = $1 LIMIT 1`, f.matiereNotee).Scan(&ctrlNote)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (14, false, false, $1, $2)`,
		devID, ctrlNote)
	require.NoError(t, err)

	stats, err := queries.GetUeStats(ctx, f.ueID)
	require.NoError(t, err)

	var dev *gen.GetUeStatsRow
	for i := range stats {
		if stats[i].UserID == devID {
			dev = &stats[i]
		}
	}
	require.NotNil(t, dev, "l'élève doit apparaître sur l'UE dont il suit une matière")
	require.NotNil(t, dev.Note, "une matière non suivie n'annule pas l'UE, elle en sort")
	require.Equal(t, float64(14), *dev.Note,
		"seule la matière suivie compte, coefficient compris : 14, et non (14×1)/(2+1)")
}

// La provenance nomme la branche de calcul qui a produit la note. Elle
// n'entre dans aucun calcul : elle existe parce que les trois branches
// rendaient un nombre que rien ne distinguait à l'écran.
//
// Le cas décisif est celui du rattrapage : la note vaut alors le seuil « E »
// et ne correspond à aucune copie. Il n'était pas déductible côté client, une
// moyenne ordinaire pouvant tomber exactement sur echelle[5] — ce que cette
// fixture provoque volontairement.
func TestProvenance_NommeLaBrancheDeCalcul(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)
	f := creerFixtureNonEvaluee(t, ctx, tx)

	// Un élève rattrapé, et un élève dont la moyenne ordinaire vaut exactement
	// echelle[5] = 8 : les deux affichent 8, seule la provenance les sépare.
	var rattrapeID, pileAuSeuilID int32
	err := tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ('Bruno', 'Rattrape', 'bruno.prov@test.com', ARRAY['ELEVE']) RETURNING id`).Scan(&rattrapeID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ('Sacha', 'Seuil', 'sacha.prov@test.com', ARRAY['ELEVE']) RETURNING id`).Scan(&pileAuSeuilID)
	require.NoError(t, err)

	var ctrlNote int32
	err = tx.QueryRow(ctx, `SELECT id FROM public.controle WHERE matiere_id = $1 LIMIT 1`, f.matiereNotee).Scan(&ctrlNote)
	require.NoError(t, err)

	var ctrlRattrapage int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Rattrapage', 1.0, true, $1) RETURNING id`,
		f.matiereNotee).Scan(&ctrlRattrapage)
	require.NoError(t, err)

	// Bruno : 4 au contrôle normal, rattrapage validé -> ramené au seuil 8.
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (4, false, false, $1, $2)`,
		rattrapeID, ctrlNote)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (9, false, true, $1, $2)`,
		rattrapeID, ctrlRattrapage)
	require.NoError(t, err)

	// Sacha : 8 tout court, sans rattrapage.
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (8, false, false, $1, $2)`,
		pileAuSeuilID, ctrlNote)
	require.NoError(t, err)

	notes, err := queries.FetchNotesByMatiereID(ctx, f.matiereNotee)
	require.NoError(t, err)

	parEleve := map[int32]gen.FetchNotesByMatiereIDRow{}
	for _, n := range notes {
		parEleve[n.UserID] = n
	}

	rattrape := parEleve[rattrapeID]
	seuil := parEleve[pileAuSeuilID]

	require.NotNil(t, rattrape.Note)
	require.NotNil(t, seuil.Note)
	require.Equal(t, *seuil.Note, *rattrape.Note,
		"les deux valent 8 : c'est précisément pourquoi la note seule ne suffit pas")

	require.Equal(t, "rattrapage", rattrape.Provenance)
	require.Equal(t, "moyenne", seuil.Provenance,
		"une moyenne ordinaire qui tombe sur echelle[5] reste une moyenne")

	// La troisième branche se lit sur l'autre matière : c'est là que l'élève de
	// la fixture est non évaluée. Sur celle-ci elle a bien une note.
	nonEvaluees, err := queries.FetchNotesByMatiereID(ctx, f.matiereNE)
	require.NoError(t, err)
	require.Len(t, nonEvaluees, 1)
	require.Equal(t, f.userID, nonEvaluees[0].UserID)
	require.Equal(t, "non_evaluee", nonEvaluees[0].Provenance)
	require.Nil(t, nonEvaluees[0].Note)
}

// La provenance d'une UE remonte celle de ses matières : une moyenne d'UE qui
// intègre une matière rattrapée ne correspond pas entièrement aux copies.
func TestProvenance_RemonteDeLaMatiereALUe(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)
	f := creerFixtureNonEvaluee(t, ctx, tx)

	var eleveID int32
	err := tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ('Bruno', 'UeRatt', 'bruno.ue@test.com', ARRAY['ELEVE']) RETURNING id`).Scan(&eleveID)
	require.NoError(t, err)

	// Il suit les deux matières de l'UE ; l'une est rattrapée.
	var ctrlNE, ctrlNote int32
	err = tx.QueryRow(ctx, `SELECT id FROM public.controle WHERE matiere_id = $1 LIMIT 1`, f.matiereNE).Scan(&ctrlNE)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `SELECT id FROM public.controle WHERE matiere_id = $1 LIMIT 1`, f.matiereNotee).Scan(&ctrlNote)
	require.NoError(t, err)

	var ctrlRattrapage int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Rattrapage', 1.0, true, $1) RETURNING id`,
		f.matiereNE).Scan(&ctrlRattrapage)
	require.NoError(t, err)

	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (3, false, false, $1, $2)`,
		eleveID, ctrlNE)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (10, false, true, $1, $2)`,
		eleveID, ctrlRattrapage)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (12, false, false, $1, $2)`,
		eleveID, ctrlNote)
	require.NoError(t, err)

	stats, err := queries.GetUeStats(ctx, f.ueID)
	require.NoError(t, err)

	var ligne *gen.GetUeStatsRow
	for i := range stats {
		if stats[i].UserID == eleveID {
			ligne = &stats[i]
		}
	}
	require.NotNil(t, ligne)
	require.Equal(t, "rattrapage", ligne.Provenance,
		"une matière rattrapée porte sa provenance jusqu'à la moyenne d'UE")

	// L'élève de la fixture, non évalué, garde la sienne.
	for i := range stats {
		if stats[i].UserID == f.userID {
			require.Equal(t, "non_evaluee", stats[i].Provenance)
		}
	}
}
