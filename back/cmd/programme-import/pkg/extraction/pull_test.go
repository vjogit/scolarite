package extraction

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Les fixtures de testdata/ sont des extraits des exports réels de l'outil de
// planning tiers (cgiempt.exe, champs `CLE;valeur` séparés par `;`, une
// ligne par objet, `EOT` en fin) : cinq lignes par flux, choisies pour
// couvrir les valeurs vides, les accents et les parenthèses des libellés,
// et pour se répondre d'un flux à l'autre (la promotion 38, le cours 59, la
// salle 378 et le professeur 735 de resa.csv existent dans les autres
// fichiers). Les personnes sont anonymisées : noms et courriels remplacés.
// Jusqu'au 17 septembre 2026 ces tests lisaient des fichiers jamais commités,
// n'affirmaient rien et sortaient par log.Fatal (docs/ci.md §9) — un rouge
// permanent, écarté du verdict de la CI.
func fixture(t *testing.T, nom string) string {
	t.Helper()
	contenu, err := os.ReadFile(filepath.Join("testdata", nom))
	require.NoError(t, err)
	return string(contenu)
}

func TestExtractSalle(t *testing.T) {
	salles, err := ExtractSalle(fixture(t, "salle.csv"))
	require.NoError(t, err)
	require.Len(t, salles, 5, "cinq salles avant EOT")
	assert.Equal(t, SallePull{SA: "5", NOM: "(O. DE GOUGES - CLAV) ", CAPACITE: "219", TYPE: "Amphithéâtre "}, salles[1])
	assert.Equal(t, " ", salles[0].TYPE, "un type vide est un espace, pas une absence")
}

func TestExtractProf(t *testing.T) {
	profs, err := ExtractProf(fixture(t, "prof.csv"))
	require.NoError(t, err)
	require.Len(t, profs, 5)
	// Seul flux normalisé à l'extraction : espaces retirés, nom et prénom
	// capitalisés, courriel en minuscules — ce que l'import écrit en base.
	assert.Equal(t, Prof{PR: "1344", DET: "Mme", NOM: "Martin", PRENOM: "Sylvie", MEL: "sylvie.martin@exemple.invalid"}, profs[2])
	assert.Equal(t, "-", profs[0].NOM, "le professeur fictif du tiers garde son tiret")
}

func TestExtractCours(t *testing.T) {
	cours, err := ExtractCours(fixture(t, "cours.csv"))
	require.NoError(t, err)
	require.Len(t, cours, 5)
	assert.Equal(t, Cours{CO: "59", NOM: "7.4 SR ADMNISTRATION DES SERV RÉSEAUX "}, cours[3], "les accents traversent tels quels")
}

func TestExtractPromo(t *testing.T) {
	promos, err := ExtractPromo(fixture(t, "promo.csv"))
	require.NoError(t, err)
	require.Len(t, promos, 5)
	assert.Equal(t, Promo{P0: "38", NOM: "INFRES 2A "}, promos[3])
}

func TestExtractReservation(t *testing.T) {
	reservations, err := ExtractReservation(fixture(t, "resa.csv"))
	require.NoError(t, err)
	require.Len(t, reservations, 3)
	r := reservations[1]
	assert.Equal(t, "4820", r.PL)
	assert.Equal(t, "38", r.P0CLE)
	assert.Equal(t, "735", r.PRCLE)
	assert.Equal(t, "59", r.COCLE)
	assert.Equal(t, "378", r.SACLE)
	assert.Equal(t, "20250127", r.DATE)
	assert.Equal(t, "0830", r.HD)
	assert.Equal(t, "1230", r.HF)
	assert.Equal(t, "M162 - CROUP ", r.SALLE)
	assert.Equal(t, "M. LAVOIE ", r.PROF)
	assert.Equal(t, "SR ", r.GROUPE)
}

// Rien après EOT n'est lu, et une ligne d'un autre type est ignorée sans
// erreur : c'est le contrat de getItems, que chaque flux partage.
func TestGetItems_ArreteAEOTEtIgnoreLesAutresTypes(t *testing.T) {
	contenu := "SA;1;NOM;A ;CAPACITE;1;TYPE;x\nPR;9;DET;M. ;NOM;X ;PRENOM;Y ;MEL;z\nEOT\nSA;2;NOM;B ;CAPACITE;2;TYPE;y\n"
	salles, err := ExtractSalle(contenu)
	require.NoError(t, err)
	require.Len(t, salles, 1)
	assert.Equal(t, "1", salles[0].SA)
}
