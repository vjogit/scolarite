// Package ia porte l'abstraction d'un modèle de langage interchangeable.
//
// Origine : le motif vient du projet rex-imt du même auteur
// (backend/admin/pkg/ia/ — interface IAConnector, client commun openaichat,
// fournisseurs minces choisis par configuration). Porté le 18 septembre 2026
// pour la traduction du contenu syllabus (lot 6), avec trois adaptations :
// la consigne système voyage à part du texte (rex-imt n'envoyait qu'un
// message « user »), la température est fixée à zéro (la même entrée doit
// donner la même sortie d'une machine à l'autre), et le délai de limitation
// respecte l'annulation du contexte.
//
// Basculer de fournisseur est un changement de configuration (bloc `ia` du
// config.yaml), jamais un développement. Aucun test ni la CI n'appellent un
// fournisseur réel : pkg/ia/factice implémente l'interface.
package ia

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Connecteur : tout fournisseur de modèle de langage. `systeme` est la
// consigne, `utilisateur` le texte à traiter ; la réponse est le texte brut
// du modèle.
type Connecteur interface {
	Completer(ctx context.Context, systeme, utilisateur string) (string, error)
	// Nom identifie le traducteur dans les données (« rack/mistral-small:latest »).
	Nom() string
}

// Config : bloc `ia` du config.yaml. Deux délais d'appel : Timeout pour une
// campagne (CLI — une rubrique longue prend plusieurs secondes, personne
// n'attend), TimeoutInteractif pour le bouton « Traduire » de l'écran, qui
// doit rendre sa réponse avant le writeTimeout du serveur (30 s) et le
// proxy_read_timeout de nginx (35 s). TimeoutConnexion borne la seule
// ouverture TCP, comme pour le service PDF.
type Config struct {
	Provider          string        `yaml:"provider"`
	Timeout           time.Duration `yaml:"timeout"`
	TimeoutInteractif time.Duration `yaml:"timeout_interactif"`
	TimeoutConnexion  time.Duration `yaml:"timeout_connexion"`
}

// FournisseurConfig : bloc d'un fournisseur compatible OpenAI (`rack`). La clé
// vient de l'environnement (secrets-*.env), jamais du dépôt.
type FournisseurConfig struct {
	BaseURL string `yaml:"base_url"`
	Model   string `yaml:"model"`
	APIKey  string `yaml:"api_key"`
}

// ErreurIndisponible : le fournisseur n'a pas rendu de réponse exploitable
// (injoignable, délai, statut, corps). Le handler la traduit en 503
// SERVICE_UNAVAILABLE ; la cause ne sort jamais sur le fil.
type ErreurIndisponible struct {
	Fournisseur string
	Cause       error
}

func (e *ErreurIndisponible) Error() string {
	return fmt.Sprintf("%s: %v", e.Fournisseur, e.Cause)
}
func (e *ErreurIndisponible) Unwrap() error { return e.Cause }

// EstIndisponible : l'erreur vient-elle du fournisseur ?
func EstIndisponible(err error) bool {
	var e *ErreurIndisponible
	return errors.As(err, &e)
}
