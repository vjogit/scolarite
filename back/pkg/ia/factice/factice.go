// Package factice : le connecteur des tests et de la CI — aucun appel réseau.
// Par défaut il rend le texte reçu préfixé de « [en] », ce qui garde la mise
// en page (paragraphes, puces) et rend la traduction reconnaissable ; Reponse
// et Erreur permettent de jouer un modèle bavard ou un fournisseur en panne.
package factice

import (
	"context"
	"strings"
	"sync"

	"cyb-react/pkg/ia"
)

type Connecteur struct {
	// Reponse, si non nul, remplace la réponse par défaut.
	Reponse func(systeme, utilisateur string) string
	// Erreur, si non nul, est consulté avant chaque appel (numéroté depuis 1).
	Erreur func(appel int) error

	mu     sync.Mutex
	appels []string
}

func (c *Connecteur) Nom() string { return "factice/test" }

func (c *Connecteur) Completer(_ context.Context, systeme, utilisateur string) (string, error) {
	c.mu.Lock()
	c.appels = append(c.appels, utilisateur)
	n := len(c.appels)
	c.mu.Unlock()

	if c.Erreur != nil {
		if err := c.Erreur(n); err != nil {
			return "", &ia.ErreurIndisponible{Fournisseur: "factice", Cause: err}
		}
	}
	if c.Reponse != nil {
		return c.Reponse(systeme, utilisateur), nil
	}
	return Prefixer(utilisateur), nil
}

// Appels : les textes reçus, dans l'ordre.
func (c *Connecteur) Appels() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.appels...)
}

// Prefixer : la « traduction » par défaut — chaque ligne non vide reçoit
// « [en] » après son éventuelle puce.
func Prefixer(texte string) string {
	lignes := strings.Split(texte, "\n")
	for i, l := range lignes {
		brut := strings.TrimLeft(l, " \t")
		if brut == "" {
			continue
		}
		retrait := l[:len(l)-len(brut)]
		for _, puce := range []string{"- ", "• ", "* ", "– "} {
			if strings.HasPrefix(brut, puce) {
				retrait += puce
				brut = brut[len(puce):]
				break
			}
		}
		lignes[i] = retrait + "[en] " + brut
	}
	return strings.Join(lignes, "\n")
}
