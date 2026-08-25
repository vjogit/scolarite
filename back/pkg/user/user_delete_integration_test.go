package user_test

// Effacement RGPD (art. 17) : le croisement le plus sensible avec le
// registre chaîné (docs/rgpd-registre.md). Suit le style de
// TestIntegration_Registre_EffacementUtilisateur, mais sur un utilisateur
// créé par le handler HTTP — donc avec un vrai compte Keycloak à vérifier
// détruit, ce que les fixtures ELEVE de SeedStructureFixture n'ont pas.

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"cyb-react/pkg/registre"
	registregen "cyb-react/pkg/registre/gen"
	"cyb-react/pkg/services"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func viderRegistre(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`TRUNCATE TABLE registre, registre_ancre, registre_temoin RESTART IDENTITY CASCADE`)
	require.NoError(t, err)
}

func maillonsUser(t *testing.T, pool *pgxpool.Pool) []registregen.Registre {
	t.Helper()
	rows, err := registregen.New(pool).ListMaillonsBySeq(context.Background())
	require.NoError(t, err)
	return rows
}

func deleteBody(ids ...int32) map[string][]int32 {
	return map[string][]int32{"ids": ids}
}

func TestIntegration_User_Delete_RGPD_MaillonsEtComptesDetruits(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)

	fixture := services.SeedStructureFixture(t, pool, "userdel")
	viderRegistre(t, pool)

	// Un vrai agent, avec un vrai compte Keycloak — c'est lui qu'on efface.
	agent := createTestAgent(t, pool, cfg, kc, []string{"CONSULTATION"})

	_, err := pool.Exec(context.Background(),
		`INSERT INTO note (version, note, user_id, controle_id) VALUES (1, 14, $1, $2)`,
		agent.ID, fixture.ControleID)
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(),
		`INSERT INTO jury_result (user_id, periode_id, unite_enseignement_id, grade, gpa_index, ects)
		 VALUES ($1, $2, $3, 'A', 4, 4)`, agent.ID, fixture.PeriodeID, fixture.UeID)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, newRequest(t, pool, http.MethodDelete,
		fmt.Sprintf("/%d", agent.ID), deleteBody(agent.ID)))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	// La correspondance est détruite.
	assert.Zero(t, countUsersByEmail(t, pool, *agent.Email))

	// Les maillons note.erase / jury.erase sont écrits, antérieurs à la
	// destruction — c'est le contrat de docs/rgpd-registre.md.
	rows := maillonsUser(t, pool)
	require.Len(t, rows, 2)
	ops := map[string]int{}
	for _, row := range rows {
		ops[row.Op]++
		assert.Equal(t, agent.ID, row.UserID)
		assert.Equal(t, subTest, row.AuthorSub)
	}
	assert.Equal(t, 1, ops[registre.OpNoteErase])
	assert.Equal(t, 1, ops[registre.OpJuryErase])

	res, err := registre.VerifierChaine(context.Background(), pool)
	require.NoError(t, err)
	assert.True(t, res.OK, "chaîne brisée : %s", res.Error)

	// Le compte Keycloak a été supprimé — pas de compte orphelin.
	assert.False(t, kc.exists(t, *agent.KeycloakID))
}

// Défaut réel signalé, non corrigé : les suppressions Keycloak dans Delete
// sont best-effort et leurs erreurs (y compris une connexion Keycloak
// totalement indisponible) ne sont que loguées — jamais renvoyées à
// l'appelant. La destruction DB (source de vérité RGPD) procède quoi qu'il
// arrive côté Keycloak, et la réponse reste 204 sans aucun signal (à la
// différence de email_envoye côté création) qu'un compte a pu être laissé
// derrière.
func TestIntegration_User_PannePartielle_Delete_KeycloakIndisponible_DBDetruitQuandMeme(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	kc := newKCTestClient(t, cfg)
	kc.purgeTestUsers(t)
	resetUsers(t, pool)

	agent := createTestAgent(t, pool, cfg, kc, nil)

	cfgIndisponible := &services.KeycloakConfig{
		Host:                  cfg.Host,
		Realm:                 cfg.Realm,
		Backend_client_id:     cfg.Backend_client_id,
		Backend_client_secret: "secret-invalide",
	}

	rec := httptest.NewRecorder()
	userRouter(cfgIndisponible).ServeHTTP(rec, newRequest(t, pool, http.MethodDelete,
		fmt.Sprintf("/%d", agent.ID), deleteBody(agent.ID)))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	assert.Zero(t, countUsersByEmail(t, pool, *agent.Email), "la correspondance DB est détruite malgré tout")
	assert.True(t, kc.exists(t, *agent.KeycloakID),
		"le compte Keycloak survit silencieusement : Delete n'a pas pu le supprimer et ne l'a signalé nulle part")
}

func TestIntegration_User_Delete_IdentifiantInexistant_SuccesSilencieux(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	cfg := services.GetIntegrationKeycloakConfig(t)
	resetUsers(t, pool)
	viderRegistre(t, pool)

	// Comportement réel : la suppression en masse ne vérifie l'existence
	// d'aucun id (DELETE ... WHERE id = ANY($1) ne rapporte pas de ligne
	// affectée, TracerEffacementUtilisateurs ne trouve rien à tracer). La
	// réponse est un succès silencieux, pas un NOT_FOUND.
	rec := httptest.NewRecorder()
	userRouter(cfg).ServeHTTP(rec, newRequest(t, pool, http.MethodDelete, "/999999999", deleteBody(999999999)))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	assert.Empty(t, maillonsUser(t, pool))
}
