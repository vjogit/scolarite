package user_test

// Import CSV/Excel en masse (nature + rôles en colonnes distinctes). Suit le
// patron déjà en usage pour l'import de fiche de notes
// (pkg/resultat/note/note_bareme_test.go) : classeur construit avec
// excelize, envoyé en multipart.

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cyb-react/pkg/services"
	"cyb-react/pkg/user/gen"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

type ligneImport struct {
	nom, prenom, email, nature, roles string
}

// construireImport fabrique un classeur au format attendu par ImportUsers :
// Nom | Prénom | Email | Nature | Rôles, en-têtes en ligne 1.
func construireImport(t *testing.T, lignes []ligneImport) []byte {
	t.Helper()
	f := excelize.NewFile()
	defer f.Close()
	feuille := f.GetSheetName(0)

	entetes := []string{"Nom", "Prénom", "Email", "Nature", "Rôles"}
	for i, e := range entetes {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		require.NoError(t, err)
		require.NoError(t, f.SetCellValue(feuille, cell, e))
	}
	for i, l := range lignes {
		row := i + 2
		for c, v := range []string{l.nom, l.prenom, l.email, l.nature, l.roles} {
			cell, err := excelize.CoordinatesToCellName(c+1, row)
			require.NoError(t, err)
			require.NoError(t, f.SetCellValue(feuille, cell, v))
		}
	}

	var buf bytes.Buffer
	require.NoError(t, f.Write(&buf))
	return buf.Bytes()
}

func importRequest(t *testing.T, pool *pgxpool.Pool, contenu []byte) *http.Request {
	t.Helper()
	var corps bytes.Buffer
	writer := multipart.NewWriter(&corps)
	part, err := writer.CreateFormFile("file", "import.xlsx")
	require.NoError(t, err)
	_, err = io.Copy(part, bytes.NewReader(contenu))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	req := httptest.NewRequest(http.MethodPost, "/import", &corps)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return withTestContext(req, pool)
}

func TestIntegration_User_Import_Nominal(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	mail := newMailpitClient(t)
	kc.purgeTestUsers(t)
	mail.purge(t, "to:"+testMailDomain)
	resetUsers(t, pool)

	eleve := uniqueTestEmail(t)
	agent1 := uniqueTestEmail(t)
	agent2 := uniqueTestEmail(t)
	t.Cleanup(func() {
		mail.purge(t, "to:"+testMailDomain)
	})

	contenu := construireImport(t, []ligneImport{
		{nom: "Un", prenom: "Elève", email: eleve, nature: "ELEVE"},
		{nom: "Un", prenom: "Agent", email: agent1, nature: "AGENT", roles: "CONSULTATION"},
		{nom: "Deux", prenom: "Agent", email: agent2, nature: "AGENT", roles: "CONSULTATION,NOTES_ECRITURE"},
	})

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, importRequest(t, pool, contenu))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	var out struct {
		Imported    int      `json:"imported"`
		EmailEchecs []string `json:"email_echecs"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Equal(t, 3, out.Imported)
	assert.Empty(t, out.EmailEchecs)

	assert.Equal(t, 1, countUsersByEmail(t, pool, eleve))
	assert.Equal(t, 1, countUsersByEmail(t, pool, agent1))
	assert.Equal(t, 1, countUsersByEmail(t, pool, agent2))

	kcEleve := fetchUserByEmail(t, pool, eleve)
	assert.Nil(t, kcEleve.KeycloakID, "un élève importé ne porte pas de compte Keycloak")

	kcAgent1 := fetchUserByEmail(t, pool, agent1)
	require.NotNil(t, kcAgent1.KeycloakID)
	t.Cleanup(func() { kc.deleteUser(*kcAgent1.KeycloakID) })
	assert.ElementsMatch(t, []string{"CONSULTATION"}, kc.rolesOf(t, *kcAgent1.KeycloakID))

	kcAgent2 := fetchUserByEmail(t, pool, agent2)
	require.NotNil(t, kcAgent2.KeycloakID)
	t.Cleanup(func() { kc.deleteUser(*kcAgent2.KeycloakID) })
	assert.ElementsMatch(t, []string{"CONSULTATION", "NOTES_ECRITURE"}, kc.rolesOf(t, *kcAgent2.KeycloakID))

	// Un courriel UPDATE_PASSWORD par compte agent créé, aucun pour l'élève.
	mail.waitForMessageTo(t, agent1, 5*time.Second)
	mail.waitForMessageTo(t, agent2, 5*time.Second)
	mail.assertNoMessageTo(t, eleve)
}

func TestIntegration_User_Import_RoleHorsAllowlist_RefusTransactionnel(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	valide := uniqueTestEmail(t)
	invalide := uniqueTestEmail(t)
	contenu := construireImport(t, []ligneImport{
		{nom: "Valide", prenom: "Agent", email: valide, nature: "AGENT", roles: "CONSULTATION"},
		{nom: "Invalide", prenom: "Agent", email: invalide, nature: "AGENT", roles: "SUPER_ADMIN"},
	})

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, importRequest(t, pool, contenu))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())

	prob := decodeProblem(t, rec)
	assert.Equal(t, "VALIDATION_ERROR", prob.Code)
	require.Len(t, prob.Lignes, 1)
	assert.Equal(t, 3, prob.Lignes[0].Ligne) // ligne 3 du classeur (après l'en-tête)
	assert.Equal(t, services.MotifRoleInconnu, prob.Lignes[0].Motif)
	assert.Equal(t, "SUPER_ADMIN", prob.Lignes[0].Valeur)

	// Refus transactionnel : même la ligne valide n'est pas importée, ni en
	// base ni dans Keycloak.
	assert.Zero(t, countUsersByEmail(t, pool, valide))
	assert.Nil(t, kc.findByEmail(t, valide))
	assert.Nil(t, kc.findByEmail(t, invalide))
}

func TestIntegration_User_Import_AnomaliesStructurelles(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	resetUsers(t, pool)

	valide := uniqueTestEmail(t)
	contenu := construireImport(t, []ligneImport{
		{nom: "SansEmail", prenom: "Agent", email: "", nature: "AGENT"},
		{nom: "MauvaiseNature", prenom: "Agent", email: uniqueTestEmail(t), nature: "ETUDIANT"},
		{nom: "RoleSurEleve", prenom: "Eleve", email: uniqueTestEmail(t), nature: "ELEVE", roles: "CONSULTATION"},
		{nom: "Valide", prenom: "Agent", email: valide, nature: "AGENT"},
	})

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, importRequest(t, pool, contenu))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())

	prob := decodeProblem(t, rec)
	assert.Equal(t, "VALIDATION_ERROR", prob.Code)
	require.Len(t, prob.Lignes, 3)
	motifs := map[string]bool{}
	for _, l := range prob.Lignes {
		motifs[l.Motif] = true
	}
	assert.True(t, motifs[services.MotifEmailManquant])
	assert.True(t, motifs[services.MotifNatureInvalide])
	assert.True(t, motifs[services.MotifRoleSurEleve])

	assert.Zero(t, countUsersByEmail(t, pool, valide), "refus transactionnel : la ligne valide n'est pas importée non plus")
}

// Défaut réel signalé, non corrigé : une violation de contrainte DB pendant
// la passe d'insertion de l'import (ici, deux lignes portant le même email —
// aucune vérification de doublon intra-fichier n'existe, à la différence de
// la vérification par ligne de la passe 1) n'est pas mappée en anomalie
// RFC 9457 structurée comme le fait CreateUser (MapPgErrorToValidationErrors)
// : import.go l'enveloppe directement dans services.ServerError, un 500. Le
// rollback Keycloak du lot, lui, fonctionne : aucun compte orphelin.
func TestIntegration_User_Import_PannePartielle_DoublonIntraFichier_500NonStructure(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	email := uniqueTestEmail(t)
	contenu := construireImport(t, []ligneImport{
		{nom: "Un", prenom: "Agent", email: email, nature: "AGENT"},
		{nom: "Deux", prenom: "Agent", email: email, nature: "AGENT"}, // même email, pas de contrôle de doublon intra-fichier
	})

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, importRequest(t, pool, contenu))

	// Comportement réel : 500 non structuré, pas une anomalie RFC 9457 par
	// ligne (voir le commentaire au-dessus).
	require.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
	assert.Equal(t, "INTERNAL_ERROR", decodeProblem(t, rec).Code)

	// Le rollback, en revanche, tient : aucune ligne, aucun compte orphelin.
	assert.Zero(t, countUsersByEmail(t, pool, email))
	assert.Nil(t, kc.findByEmail(t, email))
}

// Défaut réel signalé, non corrigé (vérifié contre la Keycloak de la
// composition locale) : le format d'email n'est validé nulle part côté
// application (import.go ne vérifie que l'absence). Keycloak, lui, rejette
// la valeur (400 error-invalid-email) — cette erreur remonte telle quelle à
// travers l'errgroup jusqu'à services.ServerError : un 500 non structuré,
// alors que le contrat attendu pour une ligne fautive est une anomalie
// RFC 9457 (le motif MotifCelluleInvalide existe déjà pour ce cas côté
// import de fiche de notes, mais n'est jamais émis ici).
func TestIntegration_User_Import_EmailSyntaxiquementInvalide_500NonStructure(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	email := "pas-un-email-valide"
	contenu := construireImport(t, []ligneImport{
		{nom: "Malformé", prenom: "Agent", email: email, nature: "AGENT"},
	})

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, importRequest(t, pool, contenu))

	require.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
	assert.Equal(t, "INTERNAL_ERROR", decodeProblem(t, rec).Code)

	assert.Zero(t, countUsersByEmail(t, pool, email))
	assert.Nil(t, kc.findByEmail(t, email))
}

func fetchUserByEmail(t *testing.T, pool *pgxpool.Pool, email string) gen.User {
	t.Helper()
	var u gen.User
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT id, version, "firstName", "lastName", email, keycloak_id, type_personne FROM public."user" WHERE email = $1`, email).
		Scan(&u.ID, &u.Version, &u.FirstName, &u.LastName, &u.Email, &u.KeycloakID, &u.TypePersonne))
	return u
}
