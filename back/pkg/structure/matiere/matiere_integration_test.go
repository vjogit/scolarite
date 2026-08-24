package matiere

import (
	"bytes"
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/matiere/gen"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegration_CreateMatiere(t *testing.T) {
	// 1. Connexion à la vraie base de données (Docker)
	pool := services.GetIntegrationDBPool(t)

	// 2. Injection de la dépendance
	originalGetQueries := getQueriesFromCtx
	defer func() { getQueriesFromCtx = originalGetQueries }()
	getQueriesFromCtx = func(r *http.Request) *gen.Queries {
		return gen.New(pool)
	}

	// Helper pour créer les dépendances (Formation -> Promotion -> Option -> Periode -> UE)
	createDependencies := func(t *testing.T) int32 {
		var formationID int32
		err := pool.QueryRow(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 1) ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE SET name = EXCLUDED.name RETURNING id", "Formation Matiere Test").Scan(&formationID)
		require.NoError(t, err)

		var promotionID int32
		now := time.Now()
		err = pool.QueryRow(context.Background(), "INSERT INTO promotion (name, version, debut, fin, echelle_gpa, echelle, formation_id) VALUES ($1, 1, $2, $3, '{4,3,2,1,0.5,0}', '{16,14,12,10,8}', $4) RETURNING id",
			"Promo Matiere Test", now, now.Add(24*time.Hour), formationID).Scan(&promotionID)
		require.NoError(t, err)

		var optionID int32
		err = pool.QueryRow(context.Background(), "INSERT INTO option (name, version, promotion_id) VALUES ($1, 1, $2) RETURNING id",
			"Option Matiere Test", promotionID).Scan(&optionID)
		require.NoError(t, err)

		var periodeID int32
		err = pool.QueryRow(context.Background(), "INSERT INTO periode (name, version, debut, fin, option_id) VALUES ($1, 1, $2, $3, $4) RETURNING id",
			"Periode Matiere Test", now, now.Add(24*time.Hour), optionID).Scan(&periodeID)
		require.NoError(t, err)

		var ueID int32
		// On insère une UE valide (ECTS positifs)
		err = pool.QueryRow(context.Background(), "INSERT INTO unite_enseignement (name, version, ects, periode_id) VALUES ($1, 1, $2, $3) RETURNING id",
			"UE Matiere Test", 6.0, periodeID).Scan(&ueID)
		require.NoError(t, err)

		return ueID
	}

	tests := []struct {
		name           string
		setupDB        func(t *testing.T) int32
		inputBody      func(ueID int32) gen.Matiere
		expectedStatus int
		expectedError  string
	}{
		{
			name: "Succès - Création nominale",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement, matiere CASCADE")
				return createDependencies(t)
			},
			inputBody: func(ueID int32) gen.Matiere {
				return gen.Matiere{
					Name:                "Algèbre Linéaire",
					Heure:               20.0,
					Coeff:               2.0,
					UniteEnseignementID: ueID,
				}
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Echec - Nom vide (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement, matiere CASCADE")
				return createDependencies(t)
			},
			inputBody: func(ueID int32) gen.Matiere {
				return gen.Matiere{
					Name:                "", // Violates chk_matiere_name_length
					Heure:               20.0,
					Coeff:               2.0,
					UniteEnseignementID: ueID,
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "champ_obligatoire",
		},
		{
			name: "Echec - Heures négatives (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement, matiere CASCADE")
				return createDependencies(t)
			},
			inputBody: func(ueID int32) gen.Matiere {
				return gen.Matiere{
					Name:                "Matière Invalide Heure",
					Heure:               -5.0, // Violates chk_matiere_heure_positive
					Coeff:               2.0,
					UniteEnseignementID: ueID,
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "valeur_negative", // Vérifiez votre mapping d'erreur
		},
		{
			name: "Echec - Coefficient négatif (Contrainte CHECK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement, matiere CASCADE")
				return createDependencies(t)
			},
			inputBody: func(ueID int32) gen.Matiere {
				return gen.Matiere{
					Name:                "Matière Invalide Coeff",
					Heure:               20.0,
					Coeff:               -1.0, // Violates chk_matiere_coeff_positive
					UniteEnseignementID: ueID,
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "valeur_negative", // Vérifiez votre mapping d'erreur
		},
		{
			name: "Echec - UE ID Invalide (FK)",
			setupDB: func(t *testing.T) int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation, promotion, option, periode, unite_enseignement, matiere CASCADE")
				return 99999
			},
			inputBody: func(ueID int32) gen.Matiere {
				return gen.Matiere{
					Name:                "Matière Orpheline",
					Heure:               20.0,
					Coeff:               2.0,
					UniteEnseignementID: ueID,
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "reference_inconnue",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ueID := tt.setupDB(t)
			input := tt.inputBody(ueID)

			body, _ := json.Marshal(input)
			req := httptest.NewRequest(http.MethodPost, "/api/v0/structure/matiere", bytes.NewReader(body))
			w := httptest.NewRecorder()

			CreateMatiere(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedError != "" {
				assert.Contains(t, w.Body.String(), tt.expectedError)
			}
		})
	}
}
