package note_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"cyb-react/pkg/resultat/note/gen"
)

// L'effectif d'une fiche est déterminé par la nature de la personne
// (type_personne), plus par un rôle : ce test verrouille la migration du
// filtre. Un agent affecté au groupe — un intervenant, par exemple — ne doit
// jamais apparaître dans l'effectif, et l'élève doit y rester.
func TestFetchElevesFiche_FiltreParNature(t *testing.T) {
	ctx, tx, queries := setupTestDB(t)

	var formationID, promotionID, optionID, periodeID, ueID, matiereID, controleID, groupeID int32

	err := tx.QueryRow(ctx, `INSERT INTO public.formation (name) VALUES ('Formation Fiche') RETURNING id`).Scan(&formationID)
	require.NoError(t, err)

	echelleGpa := []float32{4, 3.5, 3, 2.5, 2, 0}
	echelle := []float32{16, 14, 12, 10, 8}
	err = tx.QueryRow(ctx, `INSERT INTO public.promotion (name, formation_id, debut, fin, echelle_gpa, echelle) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		"Promo Fiche", formationID, time.Now(), time.Now().AddDate(1, 0, 0), echelleGpa, echelle).Scan(&promotionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.option (name, promotion_id) VALUES ('Option Fiche', $1) RETURNING id`, promotionID).Scan(&optionID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.periode (name, debut, fin, option_id) VALUES ('Semestre Fiche', $1, $2, $3) RETURNING id`,
		time.Now(), time.Now().AddDate(0, 1, 0), optionID).Scan(&periodeID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.unite_enseignement (name, ects, periode_id) VALUES ('UE Fiche', 5, $1) RETURNING id`, periodeID).Scan(&ueID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.matiere (name, coeff, heure, unite_enseignement_id) VALUES ('Systèmes', 1.0, 10, $1) RETURNING id`, ueID).Scan(&matiereID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.controle (name, coeff, is_rattrapage, matiere_id) VALUES ('Partiel Systèmes', 2.0, false, $1) RETURNING id`, matiereID).Scan(&controleID)
	require.NoError(t, err)

	err = tx.QueryRow(ctx, `INSERT INTO public.groupe (name, option_id) VALUES ('TD Fiche', $1) RETURNING id`, optionID).Scan(&groupeID)
	require.NoError(t, err)

	creerPersonne := func(prenom, nom, email, nature string) int32 {
		var id int32
		err := tx.QueryRow(ctx, `INSERT INTO public."user" ("firstName", "lastName", email, type_personne) VALUES ($1, $2, $3, $4) RETURNING id`,
			prenom, nom, email, nature).Scan(&id)
		require.NoError(t, err)
		_, err = tx.Exec(ctx, `INSERT INTO public.groupe_user (groupe_id, user_id) VALUES ($1, $2)`, groupeID, id)
		require.NoError(t, err)
		return id
	}

	// Un élève et un agent, tous deux affectés au même groupe.
	eleve := creerPersonne("Emma", "Lefèvre", "emma.fiche@test.com", "ELEVE")
	creerPersonne("Paul", "Martin", "paul.fiche@test.com", "AGENT")

	lignes, err := queries.FetchElevesFiche(ctx, gen.FetchElevesFicheParams{
		ControleID: controleID,
		GroupeID:   groupeID,
	})
	require.NoError(t, err)

	// L'élève apparaît, l'agent non.
	require.Len(t, lignes, 1)
	require.Equal(t, eleve, lignes[0].ID)
	require.Equal(t, "Lefèvre", lignes[0].Lastname)
}
