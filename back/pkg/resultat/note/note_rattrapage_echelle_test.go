package note_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// La valeur attribuée à une matière dont le rattrapage est validé était écrite
// 8.0 en dur dans les trois requêtes de lecture. Elle suit désormais le seuil
// « E » de la promotion — echelle[5], le dernier seuil, celui qui sépare E
// de F.
//
// Les tests existants n'auraient pas vu la différence : ils construisent tous
// une promotion d'échelle {16,14,12,10,8}, dont le dernier seuil vaut
// précisément 8. Celui-ci prend une promotion notée sur 40, où le seuil « E »
// est 16 : avec l'ancien littéral, les trois assertions tomberaient à 8.
func TestRattrapageValide_SuitLeSeuilEDeLEchelle(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)

	var formationID, promotionID, optionID, periodeID, ueID, matiereID, userID int32

	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Formation échelle /40') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	// Promotion notée sur 40 : seuils doublés, seuil « E » à 16.
	echelleGpa := []float32{4, 3.5, 3, 2.5, 2, 0}
	echelle := []float32{32, 28, 24, 20, 16}
	err = tx.QueryRow(ctx, `
		INSERT INTO public.promotion (name, formation_id, debut, fin, echelle_gpa, echelle, bareme, matiere_eliminatoire)
		VALUES ($1, $2, $3, $4, $5, $6, 40, false) RETURNING id`,
		"Promo échelle /40", formationID, time.Now(), time.Now().AddDate(1, 0, 0), echelleGpa, echelle).Scan(&promotionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Option /40', $1) RETURNING id`, promotionID).Scan(&optionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Semestre /40', $1, $2, $3) RETURNING id`,
		time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&periodeID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE /40', 5, $1) RETURNING id`,
		periodeID).Scan(&ueID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Matière /40', 1.0, 10, $1) RETURNING id`,
		ueID).Scan(&matiereID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email) VALUES ('Alex', 'Ratt', 'alex.ratt@test.com') RETURNING id`).Scan(&userID)
	require.NoError(t, err)

	var ctrlNormal, ctrlRattrapage int32
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('CC1', 1.0, false, $1) RETURNING id`,
		matiereID).Scan(&ctrlNormal)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Rattrapage', 1.0, true, $1) RETURNING id`,
		matiereID).Scan(&ctrlRattrapage)
	require.NoError(t, err)

	// Session 1 ratée (8/40), rattrapage validé : la moyenne de matière doit
	// être remontée au seuil « E », pas laissée à 8.
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, controle_id, user_id) VALUES (8, $1, $2)`, ctrlNormal, userID)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO public.note (is_validated, controle_id, user_id) VALUES (true, $1, $2)`, ctrlRattrapage, userID)
	require.NoError(t, err)

	t.Run("moyenne de matière", func(t *testing.T) {
		notes, err := queries.FetchNotesByMatiereID(ctx, matiereID)
		require.NoError(t, err)
		require.Len(t, notes, 1)
		require.NotNil(t, notes[0].Note)
		require.Equal(t, float64(16), *notes[0].Note, "attendu echelle[5] = 16, et non le littéral 8")
	})

	t.Run("moyenne d'UE et grade", func(t *testing.T) {
		stats, err := queries.GetUeStats(ctx, ueID)
		require.NoError(t, err)
		require.Len(t, stats, 1)
		require.NotNil(t, stats[0].Note)
		require.Equal(t, float64(16), *stats[0].Note, "attendu echelle[5] = 16, et non le littéral 8")
		// 16 atteint tout juste le seuil « E » : c'est bien la note plancher
		// d'une validation, pas un échec.
		require.Equal(t, "E", stats[0].GradeLettre)
	})

	t.Run("GPA de période", func(t *testing.T) {
		gpa, err := queries.FetchNotesByPeriodeID(ctx, periodeID)
		require.NoError(t, err)
		require.Len(t, gpa, 1)
		require.NotNil(t, gpa[0].Note)
		// UE au grade E → gpa_index 5 → echelle_gpa[5] = 2.
		// Avec le littéral 8, la moyenne d'UE tombait sous echelle[5] : grade F,
		// gpa_index 0, et un GPA de 0.
		require.Equal(t, float64(2), *gpa[0].Note)
	})
}
