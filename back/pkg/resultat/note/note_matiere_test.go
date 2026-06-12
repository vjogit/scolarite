package note_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	// Remplacez par le chemin de votre package généré par sqlc
)

func TestCalculNoteMatiere_Rattrapage_FullHierarchy(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)

	// -------------------------------------------------------------------------
	// 1. PRÉPARATION DE L'ARBORESCENCE COMPLÈTE (De Formation à Matière)
	// -------------------------------------------------------------------------

	var formationID, promotionID, optionID, periodeID, ueID, matiereID, userID int32

	// A. Création de la Formation
	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Génie Logiciel2') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	// B. Création de la Promotion (avec ses règles)
	echelle_gpa := []float32{4, 3.5, 3, 2.5, 2, 0}
	echelle := []float32{16, 14, 12, 10, 8}
	err = tx.QueryRow(ctx, `INSERT INTO promotion (name, formation_id, debut, fin, echelle_gpa, echelle, matiere_eliminatoire, value_matiere_eliminatoire ) VALUES ($1, $2, $3, $4, $5, $6, $7,$8) RETURNING id`,
		"Promo Test 2", formationID, time.Now(), time.Now().AddDate(1, 0, 0), echelle_gpa, echelle, true, 6).Scan(&promotionID)
	require.NoError(t, err)

	// C. Création de l'Option
	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Dev Web', $1) RETURNING id`, promotionID).Scan(&optionID)
	require.NoError(t, err)

	// D. Création de la Période (Semestre)
	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Semestre 1', $1, $2, $3) RETURNING id`,
		time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&periodeID)
	require.NoError(t, err)

	// E. Création de l'Unité d'Enseignement (UE)
	err = tx.QueryRow(ctx, `
		INSERT INTO public.unite_enseignement (name, ects, periode_id) 
		VALUES ('UE1 : Développement', 5, $1) 
		RETURNING id`, periodeID).Scan(&ueID)
	require.NoError(t, err)

	// F. Création de la Matière
	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Algorithmie', 1.0, 10, $1) RETURNING id`, ueID).Scan(&matiereID)
	require.NoError(t, err)

	// G. Création de l'Élève (User)
	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email) VALUES ('Alice', 'Dupont', 'alice@test.com') RETURNING id`).Scan(&userID)
	require.NoError(t, err)

	// H. Création des Contrôles de la matière (2 contrôles normaux, 1 rattrapage)
	var ctrlNormal1, ctrlNormal2, ctrlRattrapage int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('CC1', 1.0, false, $1) RETURNING id`, matiereID).Scan(&ctrlNormal1)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('CC2', 2.0, false, $1) RETURNING id`, matiereID).Scan(&ctrlNormal2)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Rattrapage', 1.0, true, $1) RETURNING id`, matiereID).Scan(&ctrlRattrapage)
	require.NoError(t, err)

	// -------------------------------------------------------------------------
	// 2. EXÉCUTION DES SOUS-TESTS DE LOGIQUE MÉTIER
	// -------------------------------------------------------------------------

	t.Run("Cas 1 : Moyenne normale (sans rattrapage)", func(t *testing.T) {
		// L'élève a 10 (coeff 1) et 16 (coeff 2). Moyenne attendue : 14
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (10, $1, $2), (16, $3, $2)`, ctrlNormal1, userID, ctrlNormal2)
		require.NoError(t, err)

		notes, err := queries.FetchNotesByMatiereID(ctx, matiereID)
		require.NoError(t, err)
		require.Len(t, notes, 1)

		// Vérification
		require.Equal(t, float64(14.0), *notes[0].Note)

		// Nettoyage pour le test suivant
		tx.Exec(ctx, `DELETE FROM public.note WHERE user_id = $1`, userID)
	})

	t.Run("Cas 2 : Notes < 8 et rattrapage NON validé", func(t *testing.T) {
		// Notes S1: 4 (coeff 1) et 7 (coeff 2). Moyenne attendue : 6.0
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (4, $1, $2), (7, $3, $2)`, ctrlNormal1, userID, ctrlNormal2)
		require.NoError(t, err)

		// L'élève passe le rattrapage mais le rate (is_validated = false)
		_, err = tx.Exec(ctx, `INSERT INTO public.note (is_validated, controle_id, user_id) VALUES (false, $1, $2)`, ctrlRattrapage, userID)
		require.NoError(t, err)

		notes, err := queries.FetchNotesByMatiereID(ctx, matiereID)
		require.NoError(t, err)
		require.Len(t, notes, 1)

		// Vérification : Il ne doit PAS être remonté à 8, il garde son 6.0
		require.Equal(t, float64(6.0), *notes[0].Note)

		// Nettoyage
		tx.Exec(ctx, `DELETE FROM public.note WHERE user_id = $1`, userID)
	})

	t.Run("Cas 3 : Notes < 8 et rattrapage VALIDÉ (Plafonné à 8)", func(t *testing.T) {
		// Notes S1: 2 (coeff 1) et 5 (coeff 2). Moyenne de base : 4.0
		_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (2, $1, $2), (5, $3, $2)`, ctrlNormal1, userID, ctrlNormal2)
		require.NoError(t, err)

		// L'élève valide le rattrapage ! (is_validated = true)
		_, err = tx.Exec(ctx, `INSERT INTO public.note (is_validated, controle_id, user_id) VALUES (true, $1, $2)`, ctrlRattrapage, userID)
		require.NoError(t, err)

		notes, err := queries.FetchNotesByMatiereID(ctx, matiereID)
		require.NoError(t, err)
		require.Len(t, notes, 1)

		// Vérification : Sa note doit être "écrasée" et fixée à 8.0 grâce au rattrapage validé
		require.Equal(t, float64(8.0), *notes[0].Note)
	})
}
