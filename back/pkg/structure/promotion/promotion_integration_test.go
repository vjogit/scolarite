package promotion

import (
	"bytes"
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/promotion/gen"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_CreatePromotion(t *testing.T) {
	// 1. Connexion à la vraie base de données (Docker)
	pool := services.GetIntegrationDBPool(t)

	// 2. Injection de la dépendance
	originalGetQueries := getQueriesFromCtx
	defer func() { getQueriesFromCtx = originalGetQueries }()
	getQueriesFromCtx = func(r *http.Request) *gen.Queries {
		return gen.New(pool)
	}

	// Helper pour créer une formation et retourner son ID
	createTestFormation := func(t *testing.T) int32 {
		var formationID int32
		err := pool.QueryRow(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", "Formation Test").Scan(&formationID)
		require.NoError(t, err, "La création de la formation de test a échoué")
		return formationID
	}

	now := time.Now()

	tests := []struct {
		name           string
		setupDB        func(t *testing.T) int32 // Prépare la DB et retourne l'ID de formation à utiliser
		inputBody      func(formationID int32) gen.Promotion
		expectedStatus int
		expectedError  string
	}{
		{
			name: "Succès - Création nominale",
			setupDB: func(t *testing.T) int32 {
				_, err := pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion CASCADE")
				require.NoError(t, err)
				return createTestFormation(t)
			},
			inputBody: func(formationID int32) gen.Promotion {
				return gen.Promotion{
					Name:        "Promo 2026",
					FormationID: formationID,
					Debut:       pgtype.Timestamptz{Time: now, Valid: true},
					Fin:         pgtype.Timestamptz{Time: now.Add(24 * time.Hour), Valid: true},
				}
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Echec - Nom vide (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, err := pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion CASCADE")
				require.NoError(t, err)
				return createTestFormation(t)
			},
			inputBody: func(formationID int32) gen.Promotion {
				return gen.Promotion{
					Name:        "", // Violates chk_promotion_name_length
					FormationID: formationID,
					Debut:       pgtype.Timestamptz{Time: now, Valid: true},
					Fin:         pgtype.Timestamptz{Time: now.Add(24 * time.Hour), Valid: true},
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Ce champ est obligatoire",
		},
		{
			name: "Echec - Dates invalides (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, err := pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion CASCADE")
				require.NoError(t, err)
				return createTestFormation(t)
			},
			inputBody: func(formationID int32) gen.Promotion {
				return gen.Promotion{
					Name:        "Promo Invalide",
					FormationID: formationID,
					Debut:       pgtype.Timestamptz{Time: now, Valid: true},
					Fin:         pgtype.Timestamptz{Time: now.Add(-24 * time.Hour), Valid: true}, // Violates chk_promotion_dates
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "La date de fin doit être après la date de début",
		},
		{
			name: "Echec - Doublon (Contrainte UNIQUE)",
			setupDB: func(t *testing.T) int32 {
				_, err := pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion CASCADE")
				require.NoError(t, err)
				fID := createTestFormation(t)
				_, err = pool.Exec(context.Background(), "INSERT INTO promotion (name, version, debut, fin, formation_id) VALUES ($1, 1, $2, $3, $4)",
					"Promo Doublon", time.Now(), time.Now().Add(time.Hour), fID)
				require.NoError(t, err)
				return fID
			},
			inputBody: func(formationID int32) gen.Promotion {
				return gen.Promotion{
					Name:        "Promo Doublon", // Violates promotions_name_key
					FormationID: formationID,
					Debut:       pgtype.Timestamptz{Time: now, Valid: true},
					Fin:         pgtype.Timestamptz{Time: now.Add(24 * time.Hour), Valid: true},
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Cette valeur est déjà utilisée",
		},
		{
			name: "Echec - Formation ID invalide (Contrainte FK)",
			setupDB: func(t *testing.T) int32 {
				_, err := pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion CASCADE")
				require.NoError(t, err)
				return 99999 // Retourne un ID invalide
			},
			inputBody: func(formationID int32) gen.Promotion {
				return gen.Promotion{
					Name:        "Promo sans formation",
					FormationID: formationID, // Violates fk_promotions_formation
					Debut:       pgtype.Timestamptz{Time: now, Valid: true},
					Fin:         pgtype.Timestamptz{Time: now.Add(24 * time.Hour), Valid: true},
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "La formation spécifiée n'existe pas",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			formationID := tt.setupDB(t)
			input := tt.inputBody(formationID)

			body, _ := json.Marshal(input)
			req := httptest.NewRequest(http.MethodPost, "/api/v0/structure/promotion", bytes.NewReader(body))
			w := httptest.NewRecorder()

			CreatePromotion(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code, "Le code de statut HTTP est incorrect")

			if tt.expectedError != "" {
				assert.Contains(t, w.Body.String(), tt.expectedError, "Le message d'erreur attendu n'a pas été trouvé")
			}
		})
	}
}
