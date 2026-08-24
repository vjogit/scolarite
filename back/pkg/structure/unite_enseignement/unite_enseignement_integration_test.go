package unite_enseignement

import (
	"bytes"
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/unite_enseignement/gen"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_CreateUniteEnseignement(t *testing.T) {
	// 1. Connexion à la vraie base de données (Docker)
	pool := services.GetIntegrationDBPool(t)

	// 2. Injection de la dépendance
	originalGetQueries := getQueriesFromCtx
	defer func() { getQueriesFromCtx = originalGetQueries }()
	getQueriesFromCtx = func(r *http.Request) *gen.Queries {
		return gen.New(pool)
	}

	// Helper pour créer les dépendances (Formation -> Promotion -> Option -> Periode)
	createDependencies := func(t *testing.T) int32 {
		var formationID int32
		err := pool.QueryRow(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 1) ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE SET name = EXCLUDED.name RETURNING id", "Formation UE Test").Scan(&formationID)
		require.NoError(t, err)

		var promotionID int32
		now := time.Now()
		err = pool.QueryRow(context.Background(), "INSERT INTO promotion (name, version, debut, fin, echelle_gpa, echelle, formation_id) VALUES ($1, 1, $2, $3, '{4,3,2,1,0.5,0}', '{16,14,12,10,8}', $4) RETURNING id",
			"Promo UE Test", now, now.Add(24*time.Hour), formationID).Scan(&promotionID)
		require.NoError(t, err)

		var optionID int32
		err = pool.QueryRow(context.Background(), "INSERT INTO option (name, version, promotion_id) VALUES ($1, 1, $2) RETURNING id",
			"Option UE Test", promotionID).Scan(&optionID)
		require.NoError(t, err)

		var periodeID int32
		err = pool.QueryRow(context.Background(), "INSERT INTO periode (name, version, debut, fin, option_id) VALUES ($1, 1, $2, $3, $4) RETURNING id",
			"Periode UE Test", now, now.Add(24*time.Hour), optionID).Scan(&periodeID)
		require.NoError(t, err)

		return periodeID
	}

	tests := []struct {
		name           string
		setupDB        func(t *testing.T) int32
		inputBody      func(periodeID int32) gen.UniteEnseignement
		expectedStatus int
		expectedError  string
	}{
		{
			name: "Succès - Création nominale",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement CASCADE")
				return createDependencies(t)
			},
			inputBody: func(periodeID int32) gen.UniteEnseignement {
				return gen.UniteEnseignement{
					Name:      "Mathématiques Avancées",
					Ects:      6.0,
					PeriodeID: periodeID,
				}
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Echec - ECTS Négatifs (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement CASCADE")
				return createDependencies(t)
			},
			inputBody: func(periodeID int32) gen.UniteEnseignement {
				return gen.UniteEnseignement{
					Name:      "UE Invalide ECTS",
					Ects:      -2.0, // Violates chk_ue_ects_positive
					PeriodeID: periodeID,
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "valeur_negative", // Vérifiez que votre mapping d'erreur contient ce mot clé
		},
		{
			name: "Echec - Période ID Invalide (FK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement CASCADE")
				return 99999
			},
			inputBody: func(periodeID int32) gen.UniteEnseignement {
				return gen.UniteEnseignement{
					Name:      "UE Orpheline",
					Ects:      3.0,
					PeriodeID: periodeID,
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "reference_inconnue",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			periodeID := tt.setupDB(t)
			input := tt.inputBody(periodeID)

			body, _ := json.Marshal(input)
			req := httptest.NewRequest(http.MethodPost, "/api/v0/structure/unite_enseignement", bytes.NewReader(body))
			w := httptest.NewRecorder()

			CreateUniteEnseignement(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedError != "" {
				assert.Contains(t, w.Body.String(), tt.expectedError)
			}
		})
	}
}
