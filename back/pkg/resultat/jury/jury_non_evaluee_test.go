package jury

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"cyb-react/pkg/resultat/jury/gen"
)

// Le jury lisait sa propre fonction de calcul, distincte de celle des écrans
// Notes, et les deux divergeaient sur deux points :
//
//   - le rattrapage validé s'appliquait au niveau de l'UE et laissait la
//     matière à sa moyenne S1, donc sous le seuil éliminatoire : le même élève
//     ressortait E côté Notes et F côté Jury ;
//   - une UE dont une matière n'avait pas de moyenne se calculait quand même,
//     sur un dénominateur complet et un numérateur amputé.
//
// La v5 aligne le jury sur note_read_ue.sql. Ces tests fixent les deux points,
// que rien ne couvrait.

type fixtureJury struct {
	periodeID         int32
	ueRattrapee       int32
	ueNonEvaluee      int32
	eleveRattrape     int32
	eleveNonEvalue    int32
	matiereRattrapee  int32
	matiereNonEvaluee int32
}

// creerFixtureJury bâtit une période de deux UE :
//
//   - « UE rattrapée » : une matière ratée (5) puis rattrapée avec succès.
//     Le seuil « E » vaut 8 et le seuil éliminatoire 6 : appliqué à la matière,
//     le rattrapage la remonte à 8 et écarte l'élimination ; appliqué à l'UE,
//     la matière reste à 5 et l'élève est éliminé.
//   - « UE non évaluée » : une matière non évaluée de coefficient 2 à côté
//     d'une matière notée 16 de coefficient 1.
func creerFixtureJury(t *testing.T, ctx context.Context, tx pgx.Tx) fixtureJury {
	t.Helper()

	var f fixtureJury
	var formationID, promotionID, optionID int32

	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Formation jury N.E.') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	echelleGpa := []float32{4, 3.5, 3, 2.5, 2, 0}
	echelle := []float32{16, 14, 12, 10, 8}
	err = tx.QueryRow(ctx, `
		INSERT INTO public.promotion (name, formation_id, debut, fin, echelle_gpa, echelle, bareme,
		                              matiere_eliminatoire, value_matiere_eliminatoire)
		VALUES ($1, $2, $3, $4, $5, $6, 20, true, 6) RETURNING id`,
		"Promo jury N.E.", formationID, time.Now(), time.Now().AddDate(1, 0, 0), echelleGpa, echelle).Scan(&promotionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Option jury', $1) RETURNING id`,
		promotionID).Scan(&optionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Semestre jury', $1, $2, $3) RETURNING id`,
		time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&f.periodeID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE rattrapée', 6, $1) RETURNING id`,
		f.periodeID).Scan(&f.ueRattrapee)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE non évaluée', 4, $1) RETURNING id`,
		f.periodeID).Scan(&f.ueNonEvaluee)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Matière rattrapée', 1.0, 10, $1) RETURNING id`,
		f.ueRattrapee).Scan(&f.matiereRattrapee)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Matière non évaluée', 2.0, 20, $1) RETURNING id`,
		f.ueNonEvaluee).Scan(&f.matiereNonEvaluee)
	require.NoError(t, err)
	var matiereNotee int32
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Matière notée', 1.0, 10, $1) RETURNING id`,
		f.ueNonEvaluee).Scan(&matiereNotee)
	require.NoError(t, err)

	var ctrlNormal, ctrlRattrapage, ctrlNE, ctrlNote int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Partiel', 1.0, false, $1) RETURNING id`,
		f.matiereRattrapee).Scan(&ctrlNormal)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Rattrapage', 1.0, true, $1) RETURNING id`,
		f.matiereRattrapee).Scan(&ctrlRattrapage)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Partiel NE', 1.0, false, $1) RETURNING id`,
		f.matiereNonEvaluee).Scan(&ctrlNE)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('TP', 1.0, false, $1) RETURNING id`,
		matiereNotee).Scan(&ctrlNote)
	require.NoError(t, err)

	// Bruno : 5 au partiel, rattrapage validé. Il ne suit pas la seconde UE.
	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ('Bruno', 'JuryRatt', 'bruno.jury@test.com', ARRAY['ELEVE']) RETURNING id`).Scan(&f.eleveRattrape)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (5, false, false, $1, $2)`,
		f.eleveRattrape, ctrlNormal)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (11, false, true, $1, $2)`,
		f.eleveRattrape, ctrlRattrapage)
	require.NoError(t, err)

	// Chloé : non évaluée dans une matière, 16 dans l'autre.
	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ('Chloé', 'JuryNE', 'chloe.jury@test.com', ARRAY['ELEVE']) RETURNING id`).Scan(&f.eleveNonEvalue)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (NULL, true, false, $1, $2)`,
		f.eleveNonEvalue, ctrlNE)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (16, false, false, $1, $2)`,
		f.eleveNonEvalue, ctrlNote)
	require.NoError(t, err)

	return f
}

func ligneUe(t *testing.T, rows []gen.Get_gpa_ues_by_periode_v5Row, userID, ueID int32) gen.Get_gpa_ues_by_periode_v5Row {
	t.Helper()
	for _, row := range rows {
		if row.UserID == userID && row.UniteEnseignementID == ueID {
			return row
		}
	}
	require.FailNowf(t, "ligne introuvable", "élève %d, UE %d", userID, ueID)
	return gen.Get_gpa_ues_by_periode_v5Row{}
}

func TestJuryV5_RattrapageSAppliqueALaMatiere(t *testing.T) {
	ctx, tx := setupJuryTx(t)
	f := creerFixtureJury(t, ctx, tx)

	rows, err := gen.New(tx).Get_gpa_ues_by_periode_v5(ctx, f.periodeID)
	require.NoError(t, err)

	ue := ligneUe(t, rows, f.eleveRattrape, f.ueRattrapee)

	require.NotNil(t, ue.MoyenneUe)
	require.Equal(t, float64(8), *ue.MoyenneUe,
		"le rattrapage validé remonte la matière au seuil E (echelle[5] = 8)")
	require.NotNil(t, ue.GradeLettre)
	require.Equal(t, "E", *ue.GradeLettre,
		"la matière rattrapée vaut 8, au-dessus du seuil éliminatoire de 6 : l'élève n'est pas éliminé. "+
			"La v4 la laissait à 5 et rendait F, en désaccord avec l'écran Notes")
}

func TestJuryV5_UeNonEvalueeAnnuleLeGpaEtCompteDansLesEcts(t *testing.T) {
	ctx, tx := setupJuryTx(t)
	f := creerFixtureJury(t, ctx, tx)

	rows, err := gen.New(tx).Get_gpa_ues_by_periode_v5(ctx, f.periodeID)
	require.NoError(t, err)

	ue := ligneUe(t, rows, f.eleveNonEvalue, f.ueNonEvaluee)

	require.Nil(t, ue.MoyenneUe,
		"l'UE ne doit pas valoir (16×1)/(2+1) = 5.33 : une matière sans moyenne ne peut pas rester au dénominateur")
	require.NotNil(t, ue.GradeLettre)
	require.Equal(t, "N.E.", *ue.GradeLettre)

	require.Nil(t, ue.GpaPeriode,
		"une seule UE non évaluée annule le GPA de la période : le semestre n'est pas terminé")

	// L'élève ne suit que l'UE non évaluée : 4 ECTS suivis, 0 validé. Le
	// dénominateur ne doit pas se réduire aux seules UE évaluables, sans quoi
	// un dossier incomplet afficherait 100 % de réussite.
	require.NotNil(t, ue.TotalEctsPeriode)
	require.Equal(t, float64(4), *ue.TotalEctsPeriode)
	require.Nil(t, ue.TotalEctsValides, "aucune UE validée")
}

// Le blocage de la délibération repose sur le grade « N.E. » remonté par la
// fonction. On vérifie que le prédicat isole bien les UE concernées, sans
// toucher aux élèves dont le dossier est complet.
func TestJuryV5_DossierIncompletEstDetectable(t *testing.T) {
	ctx, tx := setupJuryTx(t)
	f := creerFixtureJury(t, ctx, tx)

	rows, err := gen.New(tx).Get_gpa_ues_by_periode_v5(ctx, f.periodeID)
	require.NoError(t, err)

	cle := func(row gen.Get_gpa_ues_by_periode_v5Row) (int32, *string, int32) {
		return row.UserID, row.GradeLettre, row.UniteEnseignementID
	}

	incomplet := uesNonEvaluees(rows, f.eleveNonEvalue, cle)
	require.Equal(t, []int32{f.ueNonEvaluee}, incomplet,
		"l'élève non évalué est bloqué, et l'UE fautive est nommée")

	complet := uesNonEvaluees(rows, f.eleveRattrape, cle)
	require.Empty(t, complet, "un dossier complet reste délibérable")
}
