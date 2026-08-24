package note

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"

	"github.com/stretchr/testify/require"
)

// La règle de lecture d'une fiche, éprouvée sans base.
//
// `lireFiche` est pure à dessein : c'est elle qui décide ce qui s'écrit, ce qui
// refuse le fichier et ce qu'on laisse tel quel. La tester ici plutôt qu'au
// travers d'un import complet met la règle à portée, et non ses effets de bord.

const premiereLigneDonnees = 13 // index ; ligne 14 dans le tableur

// lignes construit la matrice que `GetRows` rendrait : l'en-tête bouché, puis
// une ligne de données par couple identifiant/cellule D.
func lignes(donnees ...[2]string) [][]string {
	rows := make([][]string, premiereLigneDonnees)
	for _, d := range donnees {
		rows = append(rows, []string{d[0], "", "", d[1]})
	}
	return rows
}

func ptrF32(v float32) *float32 { return &v }
func ptrStr(v string) *string   { return &v }

// noteExistante fabrique la ligne telle que `FetchNotesByControleID` la rend.
func noteExistante(userID int32, nonEvaluee bool, remarque string) gen.FetchNotesByControleIDRow {
	ligne := gen.FetchNotesByControleIDRow{
		ID:           userID * 10,
		Version:      1,
		UserID:       userID,
		FirstName:    ptrStr("Chloé"),
		LastName:     ptrStr("Nguyen"),
		NotEvaluated: nonEvaluee,
	}
	if remarque != "" {
		ligne.Remarque = ptrStr(remarque)
	}
	if !nonEvaluee {
		ligne.Note = ptrF32(12)
	}
	return ligne
}

func TestLireCelluleNote(t *testing.T) {
	cas := []struct {
		nom     string
		cellule []string
		attendu contenuCellule
		valeur  float32
	}{
		{"cellule absente", []string{"42"}, celluleVide, 0},
		{"cellule vide", []string{"42", "", "", ""}, celluleVide, 0},
		{"espaces seuls", []string{"42", "", "", "   "}, celluleVide, 0},
		{"entier", []string{"42", "", "", "12"}, celluleNote, 12},
		{"point décimal", []string{"42", "", "", "12.5"}, celluleNote, 12.5},
		// La fiche circule auprès d'enseignants francophones : la virgule est
		// la saisie normale, pas une faute. Elle valait « non évalué » avant.
		{"virgule décimale", []string{"42", "", "", "12,5"}, celluleNote, 12.5},
		{"arrondi à deux décimales", []string{"42", "", "", "12,344"}, celluleNote, 12.34},
		{"zéro", []string{"42", "", "", "0"}, celluleNote, 0},
		{"texte", []string{"42", "", "", "abs"}, celluleIllisible, 0},
		{"faute de frappe", []string{"42", "", "", "1O"}, celluleIllisible, 0},
	}

	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			contenu, valeur := lireCelluleNote(c.cellule)
			require.Equal(t, c.attendu, contenu)
			if c.attendu == celluleNote {
				require.InDelta(t, c.valeur, valeur, 0.001)
			}
		})
	}
}

// Le test qui protège l'usage normal.
//
// Une cellule vide en face d'un élève déclaré non évalué n'est pas un conflit :
// c'est le cas le plus fréquent, l'enseignant n'ayant rien à corriger pour un
// absent. Si le garde portait sur la ligne plutôt que sur la valeur, toute
// fiche comportant un absent serait refusée et la fonction inutilisable.
func TestLireFiche_CelluleVideFaceAUnAbsent(t *testing.T) {
	etat := map[int32]gen.FetchNotesByControleIDRow{
		7: noteExistante(7, true, "Absente justifiée"),
	}

	aEcrire, anomalies, ignorees := lireFiche(lignes([2]string{"7", ""}), 20, etat)

	require.Empty(t, anomalies, "une cellule vide n'affirme rien, elle ne peut rien contredire")
	require.Empty(t, aEcrire)
	require.Equal(t, 1, ignorees)
}

func TestLireFiche_CelluleVideNeToucheAAucuneLigne(t *testing.T) {
	etat := map[int32]gen.FetchNotesByControleIDRow{
		1: noteExistante(1, false, ""),
		2: noteExistante(2, true, "Hors groupe"),
	}

	aEcrire, anomalies, ignorees := lireFiche(
		lignes([2]string{"1", ""}, [2]string{"2", ""}, [2]string{"3", ""}), 20, etat)

	require.Empty(t, anomalies)
	require.Empty(t, aEcrire, "ni création, ni mise à jour, ni suppression")
	require.Equal(t, 3, ignorees)
}

func TestLireFiche_NoteSurUnAbsentRefuseLaFiche(t *testing.T) {
	etat := map[int32]gen.FetchNotesByControleIDRow{
		7: noteExistante(7, true, "Absente justifiée"),
	}

	aEcrire, anomalies, _ := lireFiche(lignes([2]string{"7", "12"}), 20, etat)

	require.Len(t, anomalies, 1)
	require.True(t, anomalies[0].conflit, "c'est un conflit d'état, pas un défaut de fichier")
	require.Empty(t, aEcrire, "rien ne s'écrit tant qu'une anomalie subsiste")

	a := anomalies[0].LigneErreur
	require.Equal(t, 14, a.Ligne, "la ligne du tableur doit être désignée")
	require.Equal(t, services.MotifNoteSurNonEvalue, a.Motif)
	require.Equal(t, "Nguyen Chloé", a.Eleve, "l'élève doit être nommé")
	require.Equal(t, "Absente justifiée", a.Remarque, "le motif consigné rend le conflit arbitrable")
	require.Equal(t, "12", a.Valeur, "la note en cause doit figurer")
}

func TestLireFiche_ConflitSansRemarqueResteLisible(t *testing.T) {
	etat := map[int32]gen.FetchNotesByControleIDRow{
		7: noteExistante(7, true, ""),
	}

	_, anomalies, _ := lireFiche(lignes([2]string{"7", "9"}), 20, etat)

	require.Len(t, anomalies, 1)
	require.Empty(t, anomalies[0].Remarque, "pas de remarque inventée faute de motif consigné")
}

// Les conflits d'absence arrivent par paquets : les signaler un à un
// coûterait autant d'allers-retours de fichier.
func TestLireFiche_TousLesConflitsSontSignales(t *testing.T) {
	etat := map[int32]gen.FetchNotesByControleIDRow{}
	var donnees [][2]string
	for i := int32(1); i <= 3; i++ {
		etat[i] = noteExistante(i, true, "Absent")
		donnees = append(donnees, [2]string{fmt.Sprintf("%d", i), "10"})
	}

	_, anomalies, _ := lireFiche(lignes(donnees...), 20, etat)

	require.Len(t, anomalies, 3, "le refus porte la liste complète")
}

func TestLireFiche_NoteOrdinaireEstRetenue(t *testing.T) {
	etat := map[int32]gen.FetchNotesByControleIDRow{
		1: noteExistante(1, false, "Copie rendue en retard"),
	}

	aEcrire, anomalies, ignorees := lireFiche(
		lignes([2]string{"1", "15,5"}, [2]string{"2", "8"}), 20, etat)

	require.Empty(t, anomalies)
	require.Equal(t, 0, ignorees)
	require.Len(t, aEcrire, 2)
	require.Equal(t, int32(1), aEcrire[0].userID)
	require.InDelta(t, 15.5, aEcrire[0].note, 0.001)
	require.Equal(t, int32(2), aEcrire[1].userID)
}

func TestLireFiche_ValeursRefuseesParLeFichier(t *testing.T) {
	etat := map[int32]gen.FetchNotesByControleIDRow{}

	_, anomalies, _ := lireFiche(
		lignes([2]string{"1", "25"}, [2]string{"2", "abs"}), 20, etat)

	require.Len(t, anomalies, 2)
	for _, a := range anomalies {
		require.False(t, a.conflit, "un défaut de fichier n'est pas un conflit d'état")
	}
	require.Equal(t, services.MotifNoteHorsBareme, anomalies[0].Motif)
	require.Equal(t, "25", anomalies[0].Valeur)
	require.Equal(t, 14, anomalies[0].Ligne)
	// Le repli « illisible vaut non évalué » décidait au nom de l'utilisateur
	// à partir d'une faute de frappe. Il doit désormais se voir.
	require.Equal(t, services.MotifCelluleInvalide, anomalies[1].Motif)
	require.Equal(t, "abs", anomalies[1].Valeur)
	require.Equal(t, 15, anomalies[1].Ligne)
}

func TestLireFiche_IgnoreLesLignesHorsDonnees(t *testing.T) {
	rows := lignes([2]string{"1", "12"})
	rows = append(rows, []string{"Moyenne", "", "", "12"}) // ligne de statistiques
	rows = append(rows, []string{"", "", "", ""})

	aEcrire, anomalies, ignorees := lireFiche(rows, 20, map[int32]gen.FetchNotesByControleIDRow{})

	require.Empty(t, anomalies)
	require.Len(t, aEcrire, 1)
	require.Equal(t, 0, ignorees, "une ligne de statistiques n'est pas une ligne d'élève ignorée")
}

func TestLireFiche_FichierSansLigneDeDonnees(t *testing.T) {
	aEcrire, anomalies, ignorees := lireFiche(make([][]string, 5), 20, map[int32]gen.FetchNotesByControleIDRow{})

	require.Empty(t, aEcrire)
	require.Empty(t, anomalies)
	require.Equal(t, 0, ignorees)
}

// ── Vérifications de bout en bout ────────────────────────────────────────────
//
// Elles demandent la base d'intégration et se sautent d'elles-mêmes sans elle.
// La règle, elle, est déjà couverte plus haut sans base : ces deux-ci vérifient
// que la décision de `lireFiche` se traduit bien en écritures — ou en leur
// absence.

// Non-régression du défaut d'origine : exporter une fiche puis la réimporter
// telle quelle vidait les notes du groupe et déclarait tout le monde non
// évalué. Une fiche sans note ne doit plus rien changer du tout.
func TestIntegration_ImportFiche_FicheViergeNeChangeRien(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	f := services.SeedStructureFixture(t, pool, "vierge")
	ctx := context.Background()

	var controleID int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ('Controle vierge', 1, 1, $1) RETURNING id`,
		f.MatiereID).Scan(&controleID))

	_, err := pool.Exec(ctx,
		`INSERT INTO note (version, note, not_evaluated, user_id, controle_id) VALUES (1, 12, false, $1, $2)`,
		f.UserIDs[0], controleID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO note (version, note, not_evaluated, remarque, user_id, controle_id)
		 VALUES (1, NULL, true, 'Absent justifié', $1, $2)`,
		f.UserIDs[1], controleID)
	require.NoError(t, err)

	fiche := construireFiche(t, controleID, [][2]string{
		{fmt.Sprintf("%d", f.UserIDs[0]), ""},
		{fmt.Sprintf("%d", f.UserIDs[1]), ""},
	})

	w := httptest.NewRecorder()
	ImportFiche(w, requeteImport(t, pool, controleID, fiche))
	require.Equal(t, http.StatusOK, w.Code, "corps: %s", w.Body.String())

	var resultat ImportFicheResult
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resultat))
	require.Equal(t, 0, resultat.Created)
	require.Equal(t, 0, resultat.Updated)
	require.Equal(t, 2, resultat.Ignorees, "les deux lignes sans note sont annoncées")

	var note *float32
	var nonEvaluee bool
	var version int32
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT note, not_evaluated, version FROM note WHERE controle_id = $1 AND user_id = $2`,
		controleID, f.UserIDs[0]).Scan(&note, &nonEvaluee, &version))
	require.NotNil(t, note, "la note ne doit pas avoir été effacée")
	require.InDelta(t, 12, *note, 0.001)
	require.False(t, nonEvaluee, "une cellule vide ne déclare personne non évalué")
	require.Equal(t, int32(1), version, "aucune écriture, donc aucune version incrémentée")

	require.NoError(t, pool.QueryRow(ctx,
		`SELECT not_evaluated, version FROM note WHERE controle_id = $1 AND user_id = $2`,
		controleID, f.UserIDs[1]).Scan(&nonEvaluee, &version))
	require.True(t, nonEvaluee, "la décision de la gestionnaire est intacte")
	require.Equal(t, int32(1), version)
}

// Une note portée sur un élève déclaré non évalué met deux décisions humaines
// en contradiction : l'import ne tranche pas, il refuse et signale.
func TestIntegration_ImportFiche_NoteSurUnAbsentRefusee(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	f := services.SeedStructureFixture(t, pool, "absent")
	ctx := context.Background()

	var controleID int32
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ('Controle absent', 1, 1, $1) RETURNING id`,
		f.MatiereID).Scan(&controleID))

	_, err := pool.Exec(ctx,
		`INSERT INTO note (version, note, not_evaluated, remarque, user_id, controle_id)
		 VALUES (1, NULL, true, 'Absente justifiée', $1, $2)`,
		f.UserIDs[1], controleID)
	require.NoError(t, err)

	// La première ligne est valide : c'est bien tout l'import qui doit être
	// annulé, et pas seulement la ligne en conflit.
	fiche := construireFiche(t, controleID, [][2]string{
		{fmt.Sprintf("%d", f.UserIDs[0]), "15"},
		{fmt.Sprintf("%d", f.UserIDs[1]), "12"},
	})

	w := httptest.NewRecorder()
	ImportFiche(w, requeteImport(t, pool, controleID, fiche))

	require.Equal(t, http.StatusConflict, w.Code, "corps: %s", w.Body.String())
	corps := w.Body.String()
	require.Contains(t, corps, "BUSINESS_CONFLICT", "le fichier est bien formé, c'est l'état qui s'y oppose")
	require.Contains(t, corps, "Absente justifiée", "le motif consigné accompagne le signalement")

	var nb int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM note WHERE controle_id = $1 AND user_id = $2`,
		controleID, f.UserIDs[0]).Scan(&nb))
	require.Equal(t, 0, nb, "la ligne valide ne doit pas non plus avoir été écrite")
}
