package option

import (
	"bytes"
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/option/gen"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_CreateOption(t *testing.T) {
	// 1. Connexion à la vraie base de données (Docker)
	pool := services.GetIntegrationDBPool(t)

	// 2. Injection de la dépendance
	originalGetQueries := getQueriesFromCtx
	defer func() { getQueriesFromCtx = originalGetQueries }()
	getQueriesFromCtx = func(r *http.Request) *gen.Queries {
		return gen.New(pool)
	}

	// Helper pour créer les dépendances (Formation -> Promotion)
	createDependencies := func(t *testing.T) int32 {
		var formationID int32
		// On utilise ON CONFLICT pour éviter les erreurs si le test est relancé sans nettoyage complet
		err := pool.QueryRow(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 1) ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE SET name = EXCLUDED.name RETURNING id", "Formation Option Test").Scan(&formationID)
		require.NoError(t, err)

		var promotionID int32
		now := time.Now()
		err = pool.QueryRow(context.Background(), "INSERT INTO promotion (name, version, debut, fin, echelle_gpa, echelle, formation_id) VALUES ($1, 1, $2, $3, '{4,3,2,1,0.5,0}', '{16,14,12,10,8}', $4) RETURNING id",
			"Promo Option Test", now, now.Add(24*time.Hour), formationID).Scan(&promotionID)
		require.NoError(t, err)

		return promotionID
	}

	tests := []struct {
		name           string
		setupDB        func(t *testing.T) int32
		inputBody      func(promoID int32) gen.Option
		expectedStatus int
		expectedError  string
	}{
		{
			name: "Succès - Création nominale",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option CASCADE")
				return createDependencies(t)
			},
			inputBody: func(promoID int32) gen.Option {
				return gen.Option{Name: "Option A", PromotionID: promoID}
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Echec - Nom vide (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option CASCADE")
				return createDependencies(t)
			},
			inputBody: func(promoID int32) gen.Option {
				return gen.Option{Name: "", PromotionID: promoID}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Ce champ est obligatoire",
		},
		{
			name: "Echec - Promotion ID invalide (FK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option CASCADE")
				return 99999
			},
			inputBody: func(promoID int32) gen.Option {
				return gen.Option{Name: "Option Orpheline", PromotionID: promoID}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "La promotion spécifiée n'existe pas",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			promoID := tt.setupDB(t)
			input := tt.inputBody(promoID)

			body, _ := json.Marshal(input)
			req := httptest.NewRequest(http.MethodPost, "/api/v0/structure/option", bytes.NewReader(body))
			w := httptest.NewRecorder()

			CreateOption(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedError != "" {
				assert.Contains(t, w.Body.String(), tt.expectedError)
			}
		})
	}
}
