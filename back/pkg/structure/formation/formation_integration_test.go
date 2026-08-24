package formation

import (
	"bytes"
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/formation/gen"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestIntegration_CreateFormation nécessite une base de données PostgreSQL en cours d'exécution.
// Connection string: postgres://postgres:root@localhost:5432/postgres
func TestIntegration_CreateFormation(t *testing.T) {
	// 1. Connexion à la vraie base de données (Docker)
	pool := services.GetIntegrationDBPool(t)

	// 2. Injection de la dépendance : on remplace getQueriesFromCtx pour utiliser notre pool
	originalGetQueries := getQueriesFromCtx
	defer func() { getQueriesFromCtx = originalGetQueries }() // Restauration après le test

	getQueriesFromCtx = func(r *http.Request) *gen.Queries {
		return gen.New(pool)
	}

	tests := []struct {
		name           string
		setupDB        func() // Fonction pour préparer l'état de la DB avant le test
		inputBody      gen.Formation
		expectedStatus int
		expectedError  string
	}{
		{
			name: "Succès - Création nominale",
			setupDB: func() {
				// Nettoyage préalable
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation CASCADE")
			},
			inputBody:      gen.Formation{Name: "Informatique"},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Echec - Contrainte CHECK (Nom vide)",
			setupDB: func() {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation CASCADE")
			},
			inputBody:      gen.Formation{Name: ""}, // Violates chk_formation_name_length
			expectedStatus: http.StatusBadRequest,
			expectedError:  "champ_obligatoire",
		},
		{
			name: "Echec - Contrainte UNIQUE (Doublon)",
			setupDB: func() {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation CASCADE")
				// On insère une première fois "Mathématiques"
				_, err := pool.Exec(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 1)", "Mathématiques")
				assert.NoError(t, err)
			},
			inputBody:      gen.Formation{Name: "Mathématiques"}, // Violates formation_name_key
			expectedStatus: http.StatusBadRequest,
			expectedError:  "valeur_deja_utilisee",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Préparation de la DB
			if tt.setupDB != nil {
				tt.setupDB()
			}

			// Préparation de la requête
			body, _ := json.Marshal(tt.inputBody)
			req := httptest.NewRequest(http.MethodPost, "/api/v0/structure/formation", bytes.NewReader(body))
			w := httptest.NewRecorder()

			// Exécution
			CreateFormation(w, req)

			// Assertions
			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedStatus == http.StatusCreated {
				var response gen.Formation
				err := json.Unmarshal(w.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.NotZero(t, response.ID)
				assert.Equal(t, tt.inputBody.Name, response.Name)
			}

			if tt.expectedError != "" {
				// On vérifie que le JSON de retour contient bien le message d'erreur mappé
				assert.Contains(t, w.Body.String(), tt.expectedError)
			}
		})
	}
}

func TestIntegration_UpdateFormation(t *testing.T) {
	// 1. Connexion à la vraie base de données (Docker)
	pool := services.GetIntegrationDBPool(t)

	// 2. Injection de la dépendance
	originalGetQueries := getQueriesFromCtx
	defer func() { getQueriesFromCtx = originalGetQueries }()

	getQueriesFromCtx = func(r *http.Request) *gen.Queries {
		return gen.New(pool)
	}

	tests := []struct {
		name            string
		setupDB         func() int32
		inputBody       func(id int32) gen.Formation
		expectedStatus  int
		expectedVersion int32
	}{
		{
			name: "Succès - Mise à jour nominale",
			setupDB: func() int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation CASCADE")
				var id int32
				// Insertion version 1
				err := pool.QueryRow(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 1) RETURNING id", "Formation Initiale").Scan(&id)
				assert.NoError(t, err)
				return id
			},
			inputBody: func(id int32) gen.Formation {
				return gen.Formation{ID: id, Name: "Formation Modifiée", Version: 1}
			},
			expectedStatus:  http.StatusOK,
			expectedVersion: 2, // La version doit être incrémentée
		},
		{
			name: "Echec - Optimistic Lock (Version obsolète)",
			setupDB: func() int32 {
				_, _ = pool.Exec(context.Background(), "TRUNCATE TABLE formation CASCADE")
				var id int32
				// Insertion version 2 (simulant que quelqu'un d'autre a déjà modifié la ligne)
				err := pool.QueryRow(context.Background(), "INSERT INTO formation (name, version) VALUES ($1, 2) RETURNING id", "Formation Initiale").Scan(&id)
				assert.NoError(t, err)
				return id
			},
			inputBody: func(id int32) gen.Formation {
				// On essaie de mettre à jour avec la version 1 (qui est obsolète par rapport à la DB qui est à 2)
				return gen.Formation{ID: id, Name: "Tentative Update", Version: 1}
			},
			expectedStatus: http.StatusConflict,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id := tt.setupDB()
			input := tt.inputBody(id)

			body, _ := json.Marshal(input)
			req := httptest.NewRequest(http.MethodPut, "/api/v0/structure/formation/"+strconv.Itoa(int(id)), bytes.NewReader(body))
			w := httptest.NewRecorder()

			Update(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedStatus == http.StatusOK {
				var response gen.Formation
				err := json.Unmarshal(w.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, tt.expectedVersion, response.Version)
				assert.Equal(t, input.Name, response.Name)
			}
		})
	}
}
