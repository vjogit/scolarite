package jury

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"cyb-react/pkg/resultat/jury/gen"
)

// Les règles du GPA — échelle, matière éliminatoire, rattrapage — étaient
// vérifiées à travers note_read_periode.sql, qui les recalculait en direct.
// C'est le jury qui valide un semestre : ce calcul a disparu, la période lit
// désormais le relevé de délibération. Les règles vivent donc dans
// get_gpa_ues_by_periode_v5, et c'est là qu'on les éprouve.
//
// La fixture et les trois cas sont conservés à l'identique : ce qui change est
// la source interrogée, pas ce qui est attendu.

func TestCalculGpaPeriode_ReglesEtRattrapages(t *testing.T) {
	ctx, tx := setupJuryTx(t)
	queries := gen.New(tx)

	// -------------------------------------------------------------------------
	// 1. PRÉPARATION DE L'ARBORESCENCE
	// -------------------------------------------------------------------------
	var formationID, promotionID, optionID, periodeID int32
	var ue1ID, ue2ID, mat1ID, mat2ID, userID int32

	// Formation
	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Génie Informatique') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	// Promotion : Échelle GPA à 6 valeurs {A=4.0, B=3.5, C=3.0, D=2.5, E=2.0, F=0.0} et élimination < 6
	err = tx.QueryRow(ctx, `
		INSERT INTO public.promotion (name, formation_id, matiere_eliminatoire, value_matiere_eliminatoire, echelle_gpa, echelle, debut, fin) 
		VALUES ('Promo 2024', $1, true, 6.0, '{4.0, 3.5, 3.0, 2.5, 2.0, 0.0}', '{16.0, 14.0, 12.0, 10.0, 8.0}', '2024-09-01', '2025-06-30') 
		RETURNING id`, formationID).Scan(&promotionID)
	require.NoError(t, err)

	// Option & Période
	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Dev', $1) RETURNING id`, promotionID).Scan(&optionID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Semestre 1', $1, $2,$3) RETURNING id`, time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&periodeID)
	require.NoError(t, err)

	// Unités d'Enseignement : UE1 (5 ECTS) et UE2 (5 ECTS)

	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE1 Base', 5, $1) RETURNING id`, periodeID).Scan(&ue1ID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE2 Avancé', 5, $1) RETURNING id`, periodeID).Scan(&ue2ID)
	require.NoError(t, err)

	// Matières (1 par UE pour simplifier)
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff,  heure, unite_enseignement_id) VALUES ('Maths', 1.0, 10, $1) RETURNING id`, ue1ID).Scan(&mat1ID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff,  heure, unite_enseignement_id) VALUES ('Physique', 1.0, 10, $1) RETURNING id`, ue2ID).Scan(&mat2ID)
	require.NoError(t, err)

	// Contrôles
	var ctrlMat1, ctrlMat2Normal, ctrlMat2Rattrapage int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('CC Maths', 1.0, false, $1) RETURNING id`, mat1ID).Scan(&ctrlMat1)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('CC Physique', 1.0, false, $1) RETURNING id`, mat2ID).Scan(&ctrlMat2Normal)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Rattrapage Phys', 1.0, true, $1) RETURNING id`, mat2ID).Scan(&ctrlMat2Rattrapage)
	require.NoError(t, err)

	// Élève
	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email) VALUES ('Paul', 'Calcul', 'paul@test.com') RETURNING id`).Scan(&userID)
	require.NoError(t, err)

	// -------------------------------------------------------------------------
	// 2. EXÉCUTION DES SOUS-TESTS
	// -------------------------------------------------------------------------

	t.Run("Cas 1 : Bon semestre classique", func(t *testing.T) {
		// Maths: 15 (Grade B -> Index 2 -> 3.5 pts GPA)
		// Physique: 17 (Grade A -> Index 1 -> 4.0 pts GPA)
		// Formule attendue : (3.5 * 5 ECTS) + (4.0 * 5 ECTS) / 10 ECTS = 3.75 de GPA
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (15, $1, $3), (17, $2, $3)`, ctrlMat1, ctrlMat2Normal, userID)
		require.NoError(t, err)

		gpaRecords, err := queries.Get_gpa_ues_by_periode_v5(ctx, periodeID)
		require.NoError(t, err)
		require.NotEmpty(t, gpaRecords)

		require.Equal(t, float64(3.75), *gpaRecords[0].GpaPeriode)

		// Nettoyage des notes pour le test suivant
		tx.Exec(ctx, `DELETE FROM public.note WHERE user_id = $1`, userID)
	})

	t.Run("Cas 2 : Chute à cause d'une note éliminatoire", func(t *testing.T) {
		// Maths: 15 (Grade B -> Index 2 -> 3.5 pts GPA)
		// Physique: 4 (Éliminatoire < 6 -> Grade F -> Index 6 -> 0.0 pts GPA)
		// Formule attendue : (3.5 * 5 ECTS) + (0.0 * 5 ECTS) / 10 ECTS = 1.75 de GPA
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (15, $1, $3), (4, $2, $3)`, ctrlMat1, ctrlMat2Normal, userID)
		require.NoError(t, err)

		gpaRecords, err := queries.Get_gpa_ues_by_periode_v5(ctx, periodeID)
		require.NoError(t, err)
		require.NotEmpty(t, gpaRecords)

		require.Equal(t, float64(1.75), *gpaRecords[0].GpaPeriode)

		// On ne nettoie PAS les notes ici car on va utiliser ce contexte pour le rattrapage du Cas 3
	})

	t.Run("Cas 3 : Sauvetage du semestre grâce au rattrapage", func(t *testing.T) {
		// Les notes de la Session 1 (15 et 4) sont toujours en base de données.
		// On ajoute le rattrapage validé pour la Physique !
		_, err = tx.Exec(ctx, `INSERT INTO public.note (is_validated, controle_id, user_id) VALUES (true, $1, $2)`, ctrlMat2Rattrapage, userID)
		require.NoError(t, err)

		gpaRecords, err := queries.Get_gpa_ues_by_periode_v5(ctx, periodeID)
		require.NoError(t, err)
		require.NotEmpty(t, gpaRecords)

		// Explication de la magie :
		// 1. Maths: 15 (Grade B -> 3.5 pts)
		// 2. Physique : Le rattrapage validé annule le 4 et fixe la note à 8.0. L'élimination est annulée.
		//    Un 8.0 correspond au Grade E (Index 5 -> 2.0 pts GPA).
		// 3. Nouveau GPA : (3.5 * 5) + (2.0 * 5) / 10 = 2.75

		require.Equal(t, float64(2.75), *gpaRecords[0].GpaPeriode)
	})
}

// Conséquence du seuil « E » sur le GPA, pour une promotion dont l'échelle ne
// finit pas à 8. Ce cas vivait dans note_rattrapage_echelle_test.go, contre le
// calcul en direct de la période ; il suit le calcul dans le paquet jury.
//
// Avec le littéral 8 qu'utilisaient les anciennes requêtes, la moyenne d'UE
// tombait sous echelle[5] = 16 : grade F, gpa_index 0, GPA nul. En suivant le
// seuil réel, l'UE atteint tout juste « E » et vaut echelle_gpa[5] = 2.
func TestRattrapageEchelle_GpaVientDuJury(t *testing.T) {
	ctx, tx := setupJuryTx(t)
	queries := gen.New(tx)

	var formationID, promotionID, optionID, periodeID, ueID, matiereID, userID int32

	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Formation échelle /40 jury') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	// Promotion notée sur 40 : seuils doublés, seuil « E » à 16.
	echelleGpa := []float32{4, 3.5, 3, 2.5, 2, 0}
	echelle := []float32{32, 28, 24, 20, 16}
	err = tx.QueryRow(ctx, `
		INSERT INTO public.promotion (name, formation_id, debut, fin, echelle_gpa, echelle, bareme, matiere_eliminatoire)
		VALUES ($1, $2, $3, $4, $5, $6, 40, false) RETURNING id`,
		"Promo échelle /40 jury", formationID, time.Now(), time.Now().AddDate(1, 0, 0), echelleGpa, echelle).Scan(&promotionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Option /40 jury', $1) RETURNING id`, promotionID).Scan(&optionID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Semestre /40 jury', $1, $2, $3) RETURNING id`,
		time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&periodeID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE /40 jury', 5, $1) RETURNING id`,
		periodeID).Scan(&ueID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Matière /40', 1.0, 10, $1) RETURNING id`,
		ueID).Scan(&matiereID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email) VALUES ('Alex', 'RattJury', 'alex.rattjury@test.com') RETURNING id`).Scan(&userID)
	require.NoError(t, err)

	var ctrlNormal, ctrlRattrapage int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('CC1', 1.0, false, $1) RETURNING id`,
		matiereID).Scan(&ctrlNormal)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Rattrapage', 1.0, true, $1) RETURNING id`,
		matiereID).Scan(&ctrlRattrapage)
	require.NoError(t, err)

	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (10, false, false, $1, $2)`,
		userID, ctrlNormal)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, not_evaluated, is_validated, user_id, controle_id) VALUES (20, false, true, $1, $2)`,
		userID, ctrlRattrapage)
	require.NoError(t, err)

	rows, err := queries.Get_gpa_ues_by_periode_v5(ctx, periodeID)
	require.NoError(t, err)
	require.NotEmpty(t, rows)

	require.NotNil(t, rows[0].MoyenneUe)
	require.Equal(t, float64(16), *rows[0].MoyenneUe, "attendu echelle[5] = 16, et non le littéral 8")
	require.NotNil(t, rows[0].GradeLettre)
	require.Equal(t, "E", *rows[0].GradeLettre)
	require.NotNil(t, rows[0].GpaPeriode)
	require.Equal(t, float64(2), *rows[0].GpaPeriode, "grade E -> gpa_index 5 -> echelle_gpa[5] = 2")
}
