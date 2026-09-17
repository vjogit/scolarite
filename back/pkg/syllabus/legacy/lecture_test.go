package legacy_test

// Lecture des CSV, sans base : la fixture de testdata/ est celle des tests
// d'intégration, lue ici pour ce qu'elle contient (colonnes par en-tête,
// rubriques multilignes, numéros de ligne, règles de préfixe et de
// normalisation, refus d'une correspondance incomplète).

import (
	"os"
	"path/filepath"
	"testing"

	"cyb-react/pkg/syllabus/legacy"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLireDossier_Fixture(t *testing.T) {
	e, err := legacy.LireDossier("testdata", "")
	require.NoError(t, err)

	require.Len(t, e.Fiches, 17)
	require.Len(t, e.Liaisons, 10)
	assert.Len(t, e.Referentiel, 10)
	assert.Len(t, e.Periodes, 4)
	assert.Len(t, e.Blocs, 6, "le bloc 19 occupe une ligne par promotion")
	assert.Len(t, e.Exceptions, 2)

	// Rubriques multilignes conservées, numéros de ligne tels qu'un éditeur
	// les montre (le premier enregistrement occupe les lignes 2 à 5).
	f := e.Fiches[0]
	assert.Equal(t, 2, f.Ligne)
	assert.Equal(t, 6, e.Fiches[1].Ligne)
	assert.Equal(t, 8, e.Fiches[2].Ligne)
	assert.Equal(t, "FIX_5_1", f.UeCode)
	assert.Equal(t, "FIX", f.Prefixe())
	assert.Contains(t, f.UeDescription, "\nSur deux lignes.")
	require.NotNil(t, f.Contexte)
	assert.Equal(t, "Les systèmes évoluent vite.\nDeuxième paragraphe.", *f.Contexte)
	assert.Nil(t, f.SocioEnv, "cellule vide → nil")
	require.NotNil(t, f.Heures[legacy.HCoursTd])
	assert.Equal(t, 15.0, *f.Heures[legacy.HCoursTd])
	assert.Nil(t, f.Heures[legacy.HCours])

	// Liaisons : trois booléens déjà traduits.
	assert.Equal(t, legacy.LigneLiaison{Ligne: 2, Annee: "2025-2026", UeCode: "FIX_5_1", BlocID: "19", CompetenceID: "101", EtatTiers: "enseva", Enseignee: true, Evaluee: true}, e.Liaisons[0])

	// Référentiel : la position se lit dans le code, casse indifférente ; sans code, 0.
	assert.Equal(t, int32(1), e.Referentiel["101"].Position)
	assert.Equal(t, int32(3), e.Referentiel["3"].Position, "c3 minuscule")
	assert.Equal(t, int32(0), e.Referentiel["104"].Position)

	// Correspondances : remplie ou vide, jamais entre les deux.
	assert.True(t, e.Periodes[0].Remplie)
	assert.False(t, e.Periodes[2].Remplie)
	assert.Equal(t, legacy.ClePeriode{Annee: "2025-2026", Periode: "Semestre 7", Prefixe: "FIX"}, e.Periodes[2].Cle())
	assert.False(t, e.Blocs[0].Remplie)
	assert.Equal(t, "Promo 2 legacy", e.Blocs[2].Promotion, "second mappage du bloc 19")
	assert.Equal(t, int32(2), e.Blocs[3].Ordre)
	assert.Equal(t, "UE 5 legacy", e.Exceptions[1].Name)
	assert.Equal(t, "", e.Exceptions[1].MatiereLibelle, "matière vide = exception d'UE")
}

func TestPrefixeEtNormalisation(t *testing.T) {
	assert.Equal(t, "INFRES", legacy.Prefixe("INFRES_5_1"))
	assert.Equal(t, "2IAiail", legacy.Prefixe("2IAiail_iasd_10_1con"))
	assert.Equal(t, "BAT", legacy.Prefixe("BAT_9_4a"))
	assert.Equal(t, "test", legacy.Prefixe("test"))
	assert.Equal(t, "formation legacy", legacy.Normaliser("  Formation   LEGACY "))
	assert.Equal(t, "", legacy.Normaliser("   "))
}

func TestLireDossier_CorrespondanceIncomplete(t *testing.T) {
	dossier := t.TempDir()
	for _, nom := range []string{legacy.FichierFiches, legacy.FichierLiaisons, legacy.FichierReferentiel, legacy.FichierCompetences} {
		src, err := os.ReadFile(filepath.Join("testdata", nom))
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(filepath.Join(dossier, nom), src, 0o600))
	}
	require.NoError(t, os.WriteFile(filepath.Join(dossier, legacy.FichierPeriodes), []byte(
		"annee_tiers,periode_tiers,formation_prefixe_tiers,formation_name,promotion_name,option_name,periode_name,commentaire\n"+
			"2025-2026,Semestre 5,FIX,Formation legacy,,,,\n"), 0o600))
	_, err := legacy.LireDossier(dossier, "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ligne 2")
	assert.Contains(t, err.Error(), "incomplète")

	// Colonne manquante : refus nommé.
	require.NoError(t, os.WriteFile(filepath.Join(dossier, legacy.FichierPeriodes), []byte("annee_tiers,periode_tiers\n"), 0o600))
	_, err = legacy.LireDossier(dossier, "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "formation_prefixe_tiers")
}
