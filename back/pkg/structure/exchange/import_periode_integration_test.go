package exchange

import (
	"bytes"
	"context"
	"cyb-react/pkg/services"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	matiereGen "cyb-react/pkg/structure/matiere/gen"
	periodeGen "cyb-react/pkg/structure/periode/gen"
	ueGen "cyb-react/pkg/structure/unite_enseignement/gen"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_ImportPeriodeFromExcel(t *testing.T) {
	// 1. Connexion à la DB
	pool := services.GetIntegrationDBPool(t)

	// 2. Préparation des données (Formation -> Promotion -> Option)
	var optionID int32
	setupData := func() {
		_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement, matiere CASCADE")

		var formationID int32
		err := pool.QueryRow(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 1) RETURNING id", "Formation Import").Scan(&formationID)
		require.NoError(t, err)

		var promotionID int32
		now := time.Now()
		err = pool.QueryRow(context.Background(), "INSERT INTO promotion (name, version, debut, fin, formation_id) VALUES ($1, 1, $2, $3, $4) RETURNING id",
			"Promo Import", now, now.Add(24*time.Hour), formationID).Scan(&promotionID)
		require.NoError(t, err)

		err = pool.QueryRow(context.Background(), "INSERT INTO option (name, version, promotion_id) VALUES ($1, 1, $2) RETURNING id",
			"Option Import", promotionID).Scan(&optionID)
		require.NoError(t, err)
	}

	setupData()

	// 3. Lecture du fichier Excel existant
	fileContent, err := os.ReadFile("testdata/programme.xlsx")
	require.NoError(t, err, "Le fichier testdata/programme.xlsx doit être présent")

	// 4. Création de la requête Multipart
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "programme.xlsx")
	require.NoError(t, err)
	_, err = part.Write(fileContent)
	require.NoError(t, err)
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/import", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Injection du contexte DB (simulation du middleware DatabaseMiddleware)
	pgInstance := &services.Postgres{Db: pool}
	ctx := context.WithValue(req.Context(), services.PgCtxKey, pgInstance)
	req = req.WithContext(ctx)

	// 5. Exécution
	file, _, err := req.FormFile("file")
	require.NoError(t, err)
	defer file.Close()

	// Appel réel
	err = ImportPeriodeFromExcel(ctx, file, int(optionID))

	// 6. Vérifications
	assert.NoError(t, err)

	// Vérification DB
	queries := periodeGen.New(pool)

	// a. Vérifier Période
	periodes, err := queries.FetchPeriodesByOptionID(context.Background(), optionID)
	require.NoError(t, err)
	require.Len(t, periodes, 6)
	assert.Equal(t, "SEMESTRE 5", periodes[0].Name)
	periodeID := periodes[0].ID

	// b. Vérifier UE
	ueQueries := ueGen.New(pool)
	ues, err := ueQueries.FetchUniteEnseignementsByPeriodeID(context.Background(), periodeID)
	require.NoError(t, err)
	require.Len(t, ues, 9)
	assert.Equal(t, "5.1  MATH", ues[0].Name)
	assert.Equal(t, float32(4.0), ues[0].Ects)
	ueID := ues[0].ID

	// c. Vérifier Matières
	matiereQueries := matiereGen.New(pool)
	matieres, err := matiereQueries.FetchMatieresByUniteEnseignementID(context.Background(), ueID)
	require.NoError(t, err)
	require.Len(t, matieres, 3)

	// On vérifie les noms (l'ordre n'est pas garanti sans Order By, donc on map)
	matiereNames := map[string]bool{matieres[0].Name: true, matieres[1].Name: true}
	assert.True(t, matiereNames["Mathématiques pour l'ingénieur"])
	assert.True(t, matiereNames["Probabilités et statistiques"])
}
