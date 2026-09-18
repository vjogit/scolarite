// Package rack construit le connecteur du rack de l'IMT Mines Alès (Open
// WebUI, API compatible OpenAI, voir openaichat). Porté de rex-imt.
//
// ASSOMPTION, propre à ce fournisseur : le certificat HTTPS du rack est
// auto-signé, la vérification est désactivée comme par « curl -k ». C'est
// acceptable ici parce que le rack est une machine de l'école, jointe par une
// adresse connue, et que ce qui y transite — des rubriques de syllabus, du
// contenu destiné à être publié — n'est ni nominatif ni secret ; le risque
// résiduel est qu'un intermédiaire lise ou altère une traduction, que la
// relecture humaine couvre. Ne JAMAIS recopier ce transport pour un endpoint
// public : un autre fournisseur garde la vérification par défaut.
package rack

import (
	"crypto/tls"
	"net"
	"net/http"
	"time"

	"cyb-react/pkg/ia"
	"cyb-react/pkg/ia/openaichat"
)

// New crée le connecteur du rack. `timeout` borne l'appel entier,
// `timeoutConnexion` la seule ouverture TCP (rack éteint : l'échec arrive en
// quelques secondes, pas au bout du délai d'appel).
func New(cfg ia.FournisseurConfig, timeout, timeoutConnexion time.Duration) *openaichat.Connector {
	return &openaichat.Connector{
		BaseURL:  cfg.BaseURL,
		APIKey:   cfg.APIKey,
		Model:    cfg.Model,
		Provider: "rack",
		HTTPClient: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				DialContext: (&net.Dialer{Timeout: timeoutConnexion}).DialContext,
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: true, // certificat auto-signé du rack, voir l'en-tête
				},
			},
		},
	}
}
