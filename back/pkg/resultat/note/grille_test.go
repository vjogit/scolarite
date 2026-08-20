package note_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"cyb-react/pkg/resultat/note/gen"
)

// La grille de saisie est alimentée par l'effectif et non par les notes : ce
// test vérifie les deux propriétés qui en découlent et qu'aucune des requêtes
// existantes ne garantissait — un élève sans note est présent, un élève d'un
// autre groupe est absent.
func TestFetchGrilleControle_EffectifComplet(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)

	var formationID, promotionID, optionID, periodeID, ueID, matiereID, controleID int32

	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Formation Grille') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	echelleGpa := []float32{4, 3.5, 3, 2.5, 2, 0}
	echelle := []float32{16, 14, 12, 10, 8}
	err = tx.QueryRow(ctx, `INSERT INTO public.promotion (name, formation_id, debut, fin, echelle_gpa, echelle, matiere_eliminatoire, value_matiere_eliminatoire) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		"Promo Grille", formationID, time.Now(), time.Now().AddDate(1, 0, 0), echelleGpa, echelle, true, 6).Scan(&promotionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Option Grille', $1) RETURNING id`, promotionID).Scan(&optionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Semestre Grille', $1, $2, $3) RETURNING id`,
		time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&periodeID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE Grille', 5, $1) RETURNING id`, periodeID).Scan(&ueID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Réseaux', 1.0, 10, $1) RETURNING id`, ueID).Scan(&matiereID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Partiel Réseaux', 2.0, false, $1) RETURNING id`, matiereID).Scan(&controleID)
	require.NoError(t, err)

	// Deux groupes sur la même option : c'est la seule façon de vérifier que le
	// filtre porte bien sur le groupe et non sur l'option.
	var groupeTD1, groupeTD2 int32
	err = tx.QueryRow(ctx, `INSERT INTO public.groupe (name, option_id) VALUES ('TD1', $1) RETURNING id`, optionID).Scan(&groupeTD1)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `INSERT INTO public.groupe (name, option_id) VALUES ('TD2', $1) RETURNING id`, optionID).Scan(&groupeTD2)
	require.NoError(t, err)

	creerEleve := func(prenom, nom, email string, groupeID int32) int32 {
		var id int32
		err := tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, roles) VALUES ($1, $2, $3, ARRAY['ELEVE']) RETURNING id`,
			prenom, nom, email).Scan(&id)
		require.NoError(t, err)
		_, err = tx.Exec(ctx, `INSERT INTO public.groupe_user (groupe_id, user_id) VALUES ($1, $2)`, groupeID, id)
		require.NoError(t, err)
		return id
	}

	alice := creerEleve("Alice", "Bernard", "alice.grille@test.com", groupeTD1)
	marc := creerEleve("Marc", "Dupont", "marc.grille@test.com", groupeTD1)
	tom := creerEleve("Tom", "Garcia", "tom.grille@test.com", groupeTD1)
	lea := creerEleve("Léa", "Fournier", "lea.grille@test.com", groupeTD2)

	// Un seul élève du groupe est noté : les deux autres doivent tout de même
	// ressortir, c'est tout l'objet de la requête.
	_, err = tx.Exec(ctx, `INSERT INTO public.note (note, remarque, controle_id, user_id) VALUES (15.5, 'Bon devoir', $1, $2)`, controleID, alice)
	require.NoError(t, err)

	lignes, err := queries.FetchGrilleControle(ctx, gen.FetchGrilleControleParams{
		ControleID: controleID,
		GroupeID:   groupeTD1,
	})
	require.NoError(t, err)

	// Tous les élèves du groupe, y compris ceux sans note, triés nom puis prénom.
	require.Len(t, lignes, 3)
	require.Equal(t, []int32{alice, marc, tom}, []int32{lignes[0].UserID, lignes[1].UserID, lignes[2].UserID})
	require.Equal(t, "Bernard", lignes[0].Lastname)
	require.Equal(t, "Alice", lignes[0].Firstname)

	// L'élève noté porte sa note, son identifiant et sa version : de quoi
	// enchaîner une modification sans relire la ligne.
	require.NotNil(t, lignes[0].NoteID)
	require.NotNil(t, lignes[0].NoteVersion)
	require.Equal(t, int32(1), *lignes[0].NoteVersion)
	require.NotNil(t, lignes[0].Note)
	require.InDelta(t, 15.5, float64(*lignes[0].Note), 0.001)
	require.NotNil(t, lignes[0].Remarque)
	require.Equal(t, "Bon devoir", *lignes[0].Remarque)

	// Les élèves sans note sont des lignes vides à remplir.
	require.Nil(t, lignes[1].NoteID)
	require.Nil(t, lignes[1].Note)
	require.Nil(t, lignes[2].NoteID)
	require.Nil(t, lignes[2].Note)

	// Un élève d'un autre groupe de la même option n'apparaît pas.
	for _, ligne := range lignes {
		require.NotEqual(t, lea, ligne.UserID)
	}

	// Et le groupe voisin ne rend que le sien.
	autres, err := queries.FetchGrilleControle(ctx, gen.FetchGrilleControleParams{
		ControleID: controleID,
		GroupeID:   groupeTD2,
	})
	require.NoError(t, err)
	require.Len(t, autres, 1)
	require.Equal(t, lea, autres[0].UserID)
	require.Nil(t, autres[0].NoteID)
}
