package openaichat_test

// Le client compatible OpenAI, contre un serveur de test local — jamais un
// fournisseur réel. Ce qui est affirmé : la route d'Open WebUI, la consigne
// en message système, la température à zéro, la clé en Bearer, et toute
// défaillance rendue en ia.ErreurIndisponible préfixée du fournisseur.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cyb-react/pkg/ia"
	"cyb-react/pkg/ia/fournisseurs"
	"cyb-react/pkg/ia/openaichat"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompleter_EnvoieConsigneEtTexte(t *testing.T) {
	var recu struct {
		Model       string  `json:"model"`
		Temperature float64 `json:"temperature"`
		Stream      bool    `json:"stream"`
		Messages    []struct{ Role, Content string }
	}
	var chemin, autorisation string
	serveur := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		chemin, autorisation = r.URL.Path, r.Header.Get("Authorization")
		require.NoError(t, json.NewDecoder(r.Body).Decode(&recu))
		_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"Hello."}}]}`))
	}))
	defer serveur.Close()

	c := &openaichat.Connector{BaseURL: serveur.URL, APIKey: "cle", Model: "mistral-small:latest", Provider: "rack"}
	sortie, err := c.Completer(context.Background(), "consigne", "Bonjour.")
	require.NoError(t, err)
	assert.Equal(t, "Hello.", sortie)
	assert.Equal(t, "/api/chat/completions", chemin)
	assert.Equal(t, "Bearer cle", autorisation)
	assert.Equal(t, "mistral-small:latest", recu.Model)
	assert.Zero(t, recu.Temperature)
	assert.False(t, recu.Stream)
	require.Len(t, recu.Messages, 2)
	assert.Equal(t, "system", recu.Messages[0].Role)
	assert.Equal(t, "consigne", recu.Messages[0].Content)
	assert.Equal(t, "user", recu.Messages[1].Role)
	assert.Equal(t, "rack/mistral-small:latest", c.Nom())
}

func TestCompleter_Defaillances_RendentIndisponible(t *testing.T) {
	cas := map[string]http.HandlerFunc{
		"statut 500":      func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) },
		"corps illisible": func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("<html>")) },
		"aucun choix":     func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"choices":[]}`)) },
	}
	for nom, handler := range cas {
		serveur := httptest.NewServer(handler)
		c := &openaichat.Connector{BaseURL: serveur.URL, Provider: "rack"}
		_, err := c.Completer(context.Background(), "s", "u")
		assert.True(t, ia.EstIndisponible(err), nom)
		assert.ErrorContains(t, err, "rack:", nom)
		serveur.Close()
	}

	// Port fermé, et attente de limitation qui cède à l'annulation.
	_, err := (&openaichat.Connector{BaseURL: "http://127.0.0.1:1", Provider: "rack"}).Completer(context.Background(), "s", "u")
	assert.True(t, ia.EstIndisponible(err))
	ctx, annuler := context.WithCancel(context.Background())
	annuler()
	debut := time.Now()
	_, err = (&openaichat.Connector{Provider: "rack", Delay: time.Minute}).Completer(ctx, "s", "u")
	assert.True(t, ia.EstIndisponible(err))
	assert.Less(t, time.Since(debut), time.Second)
}

func TestFournisseurs_ChoixParConfiguration(t *testing.T) {
	rack := ia.FournisseurConfig{BaseURL: "https://rack.invalid", Model: "m"}
	c, err := fournisseurs.Nouveau("", rack, time.Second, time.Second)
	assert.NoError(t, err)
	assert.Nil(t, c, "fournisseur vide : pas de connecteur, pas d'erreur")

	c, err = fournisseurs.Nouveau(fournisseurs.Rack, rack, time.Second, time.Second)
	require.NoError(t, err)
	assert.Equal(t, "rack/m", c.Nom())

	c, err = fournisseurs.Nouveau(fournisseurs.Factice, rack, time.Second, time.Second)
	require.NoError(t, err)
	assert.Equal(t, "factice/test", c.Nom())

	_, err = fournisseurs.Nouveau("openai", rack, time.Second, time.Second)
	assert.Error(t, err)
	_, err = fournisseurs.Nouveau(fournisseurs.Rack, ia.FournisseurConfig{}, time.Second, time.Second)
	assert.Error(t, err, "rack sans adresse ni modèle")
}
