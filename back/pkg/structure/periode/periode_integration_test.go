package periode

import (
	"bytes"
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/periode/gen"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_CreatePeriode(t *testing.T) {
	// 1. Connexion à la vraie base de données (Docker)
	pool := services.GetIntegrationDBPool(t)

	// 2. Injection de la dépendance
	originalGetQueries := getQueriesFromCtx
	defer func() { getQueriesFromCtx = originalGetQueries }()
	getQueriesFromCtx = func(r *http.Request) *gen.Queries {
		return gen.New(pool)
	}

	// Helper pour créer les dépendances (Formation -> Promotion -> Option)
	createDependencies := func(t *testing.T) int32 {
		var formationID int32
		err := pool.QueryRow(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 1) ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE SET name = EXCLUDED.name RETURNING id", "Formation Periode Test").Scan(&formationID)
		require.NoError(t, err)

		var promotionID int32
		now := time.Now()
		err = pool.QueryRow(context.Background(), "INSERT INTO promotion (name, version, debut, fin, echelle_gpa, echelle, formation_id) VALUES ($1, 1, $2, $3, '{4,3,2,1,0.5,0}', '{16,14,12,10,8}', $4) RETURNING id",
			"Promo Periode Test", now, now.Add(24*time.Hour), formationID).Scan(&promotionID)
		require.NoError(t, err)

		var optionID int32
		err = pool.QueryRow(context.Background(), "INSERT INTO option (name, version, promotion_id) VALUES ($1, 1, $2) RETURNING id",
			"Option Periode Test", promotionID).Scan(&optionID)
		require.NoError(t, err)

		return optionID
	}

	now := time.Now()

	tests := []struct {
		name           string
		setupDB        func(t *testing.T) int32
		inputBody      func(optionID int32) gen.Periode
		expectedStatus int
		expectedError  string
	}{
		{
			name: "Succès - Création nominale",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode CASCADE")
				return createDependencies(t)
			},
			inputBody: func(optionID int32) gen.Periode {
				return gen.Periode{
					Name:     "Semestre 1",
					OptionID: optionID,
					Debut:    pgtype.Timestamptz{Time: now, Valid: true},
					Fin:      pgtype.Timestamptz{Time: now.Add(24 * time.Hour), Valid: true},
				}
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Echec - Nom vide (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode CASCADE")
				return createDependencies(t)
			},
			inputBody: func(optionID int32) gen.Periode {
				return gen.Periode{
					Name:     "",
					OptionID: optionID,
					Debut:    pgtype.Timestamptz{Time: now, Valid: true},
					Fin:      pgtype.Timestamptz{Time: now.Add(24 * time.Hour), Valid: true},
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "champ_obligatoire",
		},
		{
			name: "Echec - Dates invalides (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode CASCADE")
				return createDependencies(t)
			},
			inputBody: func(optionID int32) gen.Periode {
				return gen.Periode{
					Name:     "Semestre Invalide",
					OptionID: optionID,
					Debut:    pgtype.Timestamptz{Time: now, Valid: true},
					Fin:      pgtype.Timestamptz{Time: now.Add(-24 * time.Hour), Valid: true},
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "fin_avant_debut",
		},
		{
			name: "Echec - Option ID invalide (FK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode CASCADE")
				return 99999
			},
			inputBody: func(optionID int32) gen.Periode {
				return gen.Periode{
					Name:     "Semestre Orphelin",
					OptionID: optionID,
					Debut:    pgtype.Timestamptz{Time: now, Valid: true},
					Fin:      pgtype.Timestamptz{Time: now.Add(24 * time.Hour), Valid: true},
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "reference_inconnue",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			optionID := tt.setupDB(t)
			input := tt.inputBody(optionID)

			body, _ := json.Marshal(input)
			req := httptest.NewRequest(http.MethodPost, "/api/v0/structure/periode", bytes.NewReader(body))
			w := httptest.NewRecorder()

			CreatePeriode(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedError != "" {
				assert.Contains(t, w.Body.String(), tt.expectedError)
			}
		})
	}
}
