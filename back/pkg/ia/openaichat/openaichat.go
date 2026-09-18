// Package openaichat implémente le client commun aux fournisseurs exposant une
// API de chat compatible OpenAI sur /api/chat/completions — la convention
// d'Open WebUI, pas /v1/… Les fournisseurs (rack) s'appuient dessus et ne
// portent que ce qui les distingue : transport HTTP, délai de limitation,
// préfixe d'erreur. Porté de rex-imt (voir pkg/ia).
package openaichat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"cyb-react/pkg/ia"
)

// Taille maximale d'une réponse acceptée : une rubrique traduite tient en
// quelques kilo-octets, au-delà la réponse est aberrante.
const tailleMaxReponse = 1 << 20

// Connector appelle une API de chat compatible OpenAI.
type Connector struct {
	BaseURL string
	APIKey  string
	Model   string

	// Provider préfixe les messages d'erreur et nomme le traducteur (« rack »).
	Provider string
	// HTTPClient est utilisé pour l'appel ; http.DefaultClient si nil.
	HTTPClient *http.Client
	// Delay, si non nul, est attendu avant l'appel (limitation de débit côté
	// fournisseur). L'attente cède à l'annulation du contexte.
	Delay time.Duration
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	Stream      bool          `json:"stream"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func (c *Connector) Nom() string { return c.Provider + "/" + c.Model }

func (c *Connector) echec(etape string, err error) error {
	return &ia.ErreurIndisponible{Fournisseur: c.Provider, Cause: fmt.Errorf("%s: %w", etape, err)}
}

// Completer envoie la consigne et le texte, et rend la réponse du modèle.
// Température zéro : la sortie ne doit pas varier d'un appel à l'autre.
func (c *Connector) Completer(ctx context.Context, systeme, utilisateur string) (string, error) {
	if c.Delay > 0 {
		select {
		case <-time.After(c.Delay):
		case <-ctx.Done():
			return "", c.echec("attente", ctx.Err())
		}
	}

	body, err := json.Marshal(chatRequest{
		Model: c.Model,
		Messages: []chatMessage{
			{Role: "system", Content: systeme},
			{Role: "user", Content: utilisateur},
		},
	})
	if err != nil {
		return "", c.echec("sérialisation requête", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/api/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", c.echec("création requête", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	client := c.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", c.echec("appel HTTP", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", c.echec("réponse", fmt.Errorf("statut inattendu %d", resp.StatusCode))
	}

	var result chatResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, tailleMaxReponse)).Decode(&result); err != nil {
		return "", c.echec("décodage réponse", err)
	}
	if len(result.Choices) == 0 {
		return "", c.echec("réponse", fmt.Errorf("aucun choix"))
	}
	return result.Choices[0].Message.Content, nil
}
