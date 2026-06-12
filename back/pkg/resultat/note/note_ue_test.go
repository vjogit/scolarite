package note_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	// Remplacez par le chemin de votre package généré par sqlc
)

func TestCalculUeStats_RegleEliminatoireEtRattrapage(t *testing.T) {
	ctx, tx, queries := setupTestDB(t) // Utilise la même fonction de setup que précédemment

	// -------------------------------------------------------------------------
	// 1. PRÉPARATION DE L'ARBORESCENCE (Avec les règles métier)
	// -------------------------------------------------------------------------
	var formationID, promotionID, optionID, periodeID, ueID, mat1ID, mat2ID, userID int32

	// Formation
	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Génie Informatique') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	// Promotion : Note éliminatoire à 6.0
	err = tx.QueryRow(ctx, `
		INSERT INTO public.promotion (name, formation_id, matiere_eliminatoire, value_matiere_eliminatoire, echelle_gpa, echelle, debut, fin) 
		VALUES ('Promo 2024', $1, true, 6.0, '{4.0, 3.5, 3.0, 2.5, 2.0, 0.0}', '{16.0, 14.0, 12.0, 10.0, 8.0}',$2, $3) 
		RETURNING id`, formationID, "2024-09-01", "2025-06-30").Scan(&promotionID)
	require.NoError(t, err)

	// Option & Période
	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Dev', $1) RETURNING id`, promotionID).Scan(&optionID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin,option_id) VALUES ('Semestre 1', $1,$2,$3) RETURNING id`, time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&periodeID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `
		INSERT INTO public.unite_enseignement (name, ects, periode_id) 
		VALUES ('UE Programmation', 5, $1) 
		RETURNING id`, periodeID).Scan(&ueID)
	require.NoError(t, err)

	// Matières : Matière 1 (coeff 2) et Matière 2 (coeff 1)
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff,  heure, unite_enseignement_id) VALUES ('Backend', 2.0, 10,$1) RETURNING id`, ueID).Scan(&mat1ID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff,  heure, unite_enseignement_id) VALUES ('Frontend', 1.0, 10,$1) RETURNING id`, ueID).Scan(&mat2ID)
	require.NoError(t, err)

	// Contrôles pour chaque matière
	var ctrlMat1, ctrlMat2Normal, ctrlMat2Rattrapage int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Projet', 1.0, false, $1) RETURNING id`, mat1ID).Scan(&ctrlMat1)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('QCM', 1.0, false, $1) RETURNING id`, mat2ID).Scan(&ctrlMat2Normal)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Rattrapage Front', 1.0, true, $1) RETURNING id`, mat2ID).Scan(&ctrlMat2Rattrapage)
	require.NoError(t, err)

	// Élève
	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email) VALUES ('Marc', 'Zucker', 'marc@test.com') RETURNING id`).Scan(&userID)
	require.NoError(t, err)

	// -------------------------------------------------------------------------
	// 2. EXÉCUTION DES SOUS-TESTS
	// -------------------------------------------------------------------------

	t.Run("Cas 1 : Étudiant moyen mais régulier (Pas de note éliminatoire)", func(t *testing.T) {
		// Backend: 14/20 (coeff 2) | Frontend: 14/20 (coeff 1) => Moyenne UE : 14.0
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (14, $1, $2), (14, $3, $2)`, ctrlMat1, userID, ctrlMat2Normal)
		require.NoError(t, err)

		stats, err := queries.GetUeStats(ctx, ueID)
		require.NoError(t, err)
		require.Len(t, stats, 1)

		// Vérifications : Moyenne = 14.0, Non éliminé, Grade = 'B' (car >= 14 selon l'échelle)
		require.Equal(t, float64(14.0), *stats[0].Note)
		require.False(t, *stats[0].AMatiereEliminatoire)
		require.Equal(t, "B", stats[0].GradeLettre)

		// Nettoyage
		tx.Exec(ctx, `DELETE FROM public.note WHERE user_id = $1`, userID)
	})

	t.Run("Cas 2 : Élimination d'office (Note < 6 sans rattrapage)", func(t *testing.T) {
		// Backend: 14/20 (coeff 2) | Frontend: 4/20 (coeff 1)
		// Moyenne UE théorique : (14*2 + 4*1) / 3 = 10.66
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (14, $1, $2), (4, $3, $2)`, ctrlMat1, userID, ctrlMat2Normal)
		require.NoError(t, err)

		stats, err := queries.GetUeStats(ctx, ueID)
		require.NoError(t, err)
		require.Len(t, stats, 1)

		// Vérifications : L'étudiant devrait avoir un 'D' grâce à sa moyenne,
		// mais le 4/20 est éliminatoire (< 6). Il obtient donc 'F'.
		require.Equal(t, float64(10.666666666666666), *stats[0].Note) // (14*2 + 4)/3
		require.True(t, *stats[0].AMatiereEliminatoire)
		require.Equal(t, "F", stats[0].GradeLettre)

		// Nettoyage
		tx.Exec(ctx, `DELETE FROM public.note WHERE user_id = $1`, userID)
	})

	t.Run("Cas 3 : Sauvé par le rattrapage validé", func(t *testing.T) {
		// Backend: 14/20 (coeff 2) | Frontend: 4/20 (coeff 1)
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (14, $1, $2), (4, $3, $2)`, ctrlMat1, userID, ctrlMat2Normal)
		require.NoError(t, err)

		// Il passe le rattrapage Frontend et le valide !
		_, err = tx.Exec(ctx, `INSERT INTO public.note (is_validated, controle_id, user_id) VALUES (true, $1, $2)`, ctrlMat2Rattrapage, userID)
		require.NoError(t, err)

		stats, err := queries.GetUeStats(ctx, ueID)
		require.NoError(t, err)
		require.Len(t, stats, 1)

		// Vérifications de la "Magie" SQL :
		// 1. Le 4/20 devient 8.0 grâce au rattrapage.
		// 2. L'élimination est levée car 8 n'est pas < 6.
		// 3. Nouvelle moyenne UE : (14*2 + 8*1) / 3 = 12.0
		// 4. Grade final : 12.0 = 'C' sur l'échelle.

		require.Equal(t, float64(12.0), *stats[0].Note)
		require.False(t, *stats[0].AMatiereEliminatoire)
		require.Equal(t, "C", stats[0].GradeLettre)
	})
}
