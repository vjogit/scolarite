package note_test

import (
	"testing"
	"time"

	// "time" // Décommentez si vous utilisez time.Now() pour les dates

	"github.com/stretchr/testify/require"
)

func TestCalculGpaPeriode_ReglesEtRattrapages(t *testing.T) {
	ctx, tx, queries := setupTestDB(t) // Assurez-vous d'avoir la fonction setupTestDB dans le package

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

		gpaRecords, err := queries.FetchNotesByPeriodeID(ctx, periodeID)
		require.NoError(t, err)
		require.Len(t, gpaRecords, 1)

		require.Equal(t, float64(3.75), *gpaRecords[0].Note)

		// Nettoyage des notes pour le test suivant
		tx.Exec(ctx, `DELETE FROM public.note WHERE user_id = $1`, userID)
	})

	t.Run("Cas 2 : Chute à cause d'une note éliminatoire", func(t *testing.T) {
		// Maths: 15 (Grade B -> Index 2 -> 3.5 pts GPA)
		// Physique: 4 (Éliminatoire < 6 -> Grade F -> Index 6 -> 0.0 pts GPA)
		// Formule attendue : (3.5 * 5 ECTS) + (0.0 * 5 ECTS) / 10 ECTS = 1.75 de GPA
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (15, $1, $3), (4, $2, $3)`, ctrlMat1, ctrlMat2Normal, userID)
		require.NoError(t, err)

		gpaRecords, err := queries.FetchNotesByPeriodeID(ctx, periodeID)
		require.NoError(t, err)
		require.Len(t, gpaRecords, 1)

		require.Equal(t, float64(1.75), *gpaRecords[0].Note)

		// On ne nettoie PAS les notes ici car on va utiliser ce contexte pour le rattrapage du Cas 3
	})

	t.Run("Cas 3 : Sauvetage du semestre grâce au rattrapage", func(t *testing.T) {
		// Les notes de la Session 1 (15 et 4) sont toujours en base de données.
		// On ajoute le rattrapage validé pour la Physique !
		_, err = tx.Exec(ctx, `INSERT INTO public.note (is_validated, controle_id, user_id) VALUES (true, $1, $2)`, ctrlMat2Rattrapage, userID)
		require.NoError(t, err)

		gpaRecords, err := queries.FetchNotesByPeriodeID(ctx, periodeID)
		require.NoError(t, err)
		require.Len(t, gpaRecords, 1)

		// Explication de la magie :
		// 1. Maths: 15 (Grade B -> 3.5 pts)
		// 2. Physique : Le rattrapage validé annule le 4 et fixe la note à 8.0. L'élimination est annulée.
		//    Un 8.0 correspond au Grade E (Index 5 -> 2.0 pts GPA).
		// 3. Nouveau GPA : (3.5 * 5) + (2.0 * 5) / 10 = 2.75

		require.Equal(t, float64(2.75), *gpaRecords[0].Note)
	})
}
