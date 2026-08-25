package user

// Tests unitaires purs : aucune dépendance (ni base, ni Keycloak). Package
// interne (pas de suffixe _test) car validateRoles et normalizeTypePersonne
// ne sont pas exportées.

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateRoles_ListeFermee(t *testing.T) {
	cas := []struct {
		nom     string
		roles   []string
		accepte bool
	}{
		{"rôle légitime seul", []string{"CONSULTATION"}, true},
		{"plusieurs rôles légitimes", []string{"CONSULTATION", "NOTES_ECRITURE", "ADMIN"}, true},
		{"liste vide", []string{}, true},
		{"rôle hors allowlist", []string{"SUPER_ADMIN"}, false},
		{"chaîne vide", []string{""}, false},
		{"casse différente d'un rôle légitime", []string{"admin"}, false},
		{"un rôle légitime et un intrus", []string{"CONSULTATION", "SUPER_ADMIN"}, false},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			err := validateRoles(c.roles)
			if c.accepte {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}

func TestNormalizeTypePersonne(t *testing.T) {
	cas := []struct {
		nom     string
		entree  string
		attendu string
		erreur  bool
	}{
		{"vide vaut AGENT", "", TypePersonneAgent, false},
		{"espaces seuls valent AGENT", "   ", TypePersonneAgent, false},
		{"ELEVE", "ELEVE", TypePersonneEleve, false},
		{"AGENT", "AGENT", TypePersonneAgent, false},
		{"casse basse normalisée", "eleve", TypePersonneEleve, false},
		{"espaces autour normalisés", "  AGENT  ", TypePersonneAgent, false},
		{"valeur inconnue rejetée", "ETUDIANT", "", true},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			got, err := normalizeTypePersonne(c.entree)
			if c.erreur {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
			assert.Equal(t, c.attendu, got)
		})
	}
}
