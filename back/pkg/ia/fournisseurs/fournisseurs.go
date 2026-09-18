// Package fournisseurs choisit le connecteur par configuration (bloc `ia` du
// config.yaml) : basculer de fournisseur n'est jamais un développement.
package fournisseurs

import (
	"fmt"
	"time"

	"cyb-react/pkg/ia"
	"cyb-react/pkg/ia/factice"
	"cyb-react/pkg/ia/rack"
)

// Noms admis dans `ia.provider`.
const (
	Rack = "rack"
	// Factice : SPÉCIFIQUE DÉVELOPPEMENT, comme Mailpit — le connecteur sans
	// réseau des postes et de la CI, pour que la suite e2e exerce le bouton
	// « Traduire » sans jamais joindre un modèle réel. Jamais en production.
	Factice = "factice"
)

// Nouveau rend le connecteur du fournisseur nommé, borné par `timeout`.
// Fournisseur vide : aucun connecteur (nil, nil) — la traduction automatique
// n'est pas proposée, tout le reste du domaine fonctionne.
func Nouveau(provider string, cfgRack ia.FournisseurConfig, timeout, timeoutConnexion time.Duration) (ia.Connecteur, error) {
	switch provider {
	case "":
		return nil, nil
	case Rack:
		if cfgRack.BaseURL == "" || cfgRack.Model == "" {
			return nil, fmt.Errorf("fournisseur rack : base_url et model sont requis")
		}
		return rack.New(cfgRack, timeout, timeoutConnexion), nil
	case Factice:
		return &factice.Connecteur{}, nil
	default:
		return nil, fmt.Errorf("fournisseur IA inconnu : %q (attendu : %s, %s, ou vide)", provider, Rack, Factice)
	}
}
