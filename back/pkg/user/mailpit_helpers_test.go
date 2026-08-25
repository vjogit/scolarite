package user_test

// Petit client Mailpit (API v1 nue, net/http) pour les tests d'intégration
// du courriel UPDATE_PASSWORD : c'est Keycloak, pas l'application, qui
// envoie ce courriel, donc aucun serveur SMTP local ne peut s'y substituer
// (à la différence de smtptest_test.go dans pkg/registre, qui teste l'envoi
// fait PAR l'application). Il faut la vraie Mailpit de la composition locale.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const testMailDomain = "@test.invalid"

type mailpitClient struct {
	base string
	http *http.Client
}

// newMailpitClient se saute si Mailpit n'est pas joignable (composition
// locale coupée) — même discipline que GetIntegrationDBPool /
// GetIntegrationKeycloakConfig.
func newMailpitClient(t *testing.T) *mailpitClient {
	t.Helper()
	base := os.Getenv("TEST_MAILPIT_URL")
	if base == "" {
		base = "http://localhost:8025"
	}
	c := &mailpitClient{base: base, http: &http.Client{Timeout: 5 * time.Second}}

	req, err := http.NewRequest(http.MethodGet, base+"/api/v1/info", nil)
	require.NoError(t, err)
	resp, err := c.http.Do(req)
	if err != nil {
		t.Skipf("Skipping integration test: Mailpit non accessible (%v)", err)
	}
	resp.Body.Close()
	return c
}

type mailpitSummary struct {
	ID string `json:"ID"`
}

type mailpitSearchResponse struct {
	Messages []mailpitSummary `json:"messages"`
}

func (c *mailpitClient) searchIDs(t *testing.T, query string) []string {
	t.Helper()
	u := c.base + "/api/v1/search?query=" + url.QueryEscape(query)
	req, err := http.NewRequest(http.MethodGet, u, nil)
	require.NoError(t, err)
	resp, err := c.http.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	var out mailpitSearchResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	ids := make([]string, len(out.Messages))
	for i, m := range out.Messages {
		ids[i] = m.ID
	}
	return ids
}

// purge supprime tous les messages correspondant à la requête — hygiène (b) :
// appelée avant un test pour éliminer les survivants d'une exécution
// interrompue, et via t.Cleanup pour ne rien laisser derrière soi.
func (c *mailpitClient) purge(t *testing.T, query string) {
	t.Helper()
	ids := c.searchIDs(t, query)
	if len(ids) == 0 {
		return
	}
	body, err := json.Marshal(map[string][]string{"IDs": ids})
	require.NoError(t, err)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodDelete, c.base+"/api/v1/messages", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	require.NoError(t, err)
	resp.Body.Close()
}

type mailpitAddress struct {
	Address string `json:"Address"`
}

type mailpitMessage struct {
	ID      string           `json:"ID"`
	Subject string           `json:"Subject"`
	To      []mailpitAddress `json:"To"`
	Text    string           `json:"Text"`
	HTML    string           `json:"HTML"`
}

func (c *mailpitClient) get(t *testing.T, id string) mailpitMessage {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, c.base+"/api/v1/message/"+id, nil)
	require.NoError(t, err)
	resp, err := c.http.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	var m mailpitMessage
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&m))
	return m
}

// waitForMessageTo attend (Keycloak envoie via SMTP après avoir répondu à
// l'appel ExecuteActionsEmail : l'aller-retour n'est pas forcément terminé
// au retour du handler) le premier courriel reçu pour un destinataire donné.
func (c *mailpitClient) waitForMessageTo(t *testing.T, to string, timeout time.Duration) mailpitMessage {
	t.Helper()
	deadline := time.Now().Add(timeout)
	query := `to:"` + to + `"`
	for time.Now().Before(deadline) {
		if ids := c.searchIDs(t, query); len(ids) > 0 {
			return c.get(t, ids[0])
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatalf("aucun courriel reçu pour %s dans un délai de %s", to, timeout)
	return mailpitMessage{}
}

// bestEffortPurgeMail nettoie un destinataire donné directement (pas via
// newMailpitClient, qui appelle t.Skip — inadapté dans un t.Cleanup). Les
// erreurs sont ignorées : c'est une hygiène de fin de test, pas une
// assertion.
func bestEffortPurgeMail(to string) {
	base := os.Getenv("TEST_MAILPIT_URL")
	if base == "" {
		base = "http://localhost:8025"
	}
	client := &http.Client{Timeout: 5 * time.Second}

	u := base + "/api/v1/search?query=" + url.QueryEscape(`to:"`+to+`"`)
	resp, err := client.Get(u)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	var out mailpitSearchResponse
	if json.NewDecoder(resp.Body).Decode(&out) != nil || len(out.Messages) == 0 {
		return
	}
	ids := make([]string, len(out.Messages))
	for i, m := range out.Messages {
		ids[i] = m.ID
	}
	body, err := json.Marshal(map[string][]string{"IDs": ids})
	if err != nil {
		return
	}
	req, err := http.NewRequest(http.MethodDelete, base+"/api/v1/messages", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if resp, err := client.Do(req); err == nil {
		resp.Body.Close()
	}
}

// assertNoMessageTo vérifie l'absence de courriel — utilisé par les tests de
// panne où la création est refusée avant tout envoi.
func (c *mailpitClient) assertNoMessageTo(t *testing.T, to string) {
	t.Helper()
	time.Sleep(300 * time.Millisecond) // laisse une chance à un envoi fautif d'arriver
	ids := c.searchIDs(t, `to:"`+to+`"`)
	require.Empty(t, ids, "un courriel a été envoyé alors qu'aucun n'était attendu")
}
