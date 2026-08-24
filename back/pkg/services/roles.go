package services

import (
	"net/http"
	"slices"
)

// Rôles fonctionnels du realm Keycloak. Le modèle est « lecture globale,
// écritures ciblées » : toute lecture exige RoleConsultation, chaque écriture
// exige le rôle du domaine concerné.
//
// ADMIN existe côté Keycloak comme rôle composite contenant les huit rôles
// ci-dessous : le jeton d'un porteur d'ADMIN expose donc chacun d'eux dans
// realm_access.roles. C'est pourquoi le code ne teste JAMAIS ADMIN — si une
// route semble l'exiger, c'est qu'il manque un rôle fonctionnel.
const (
	RoleConsultation          = "CONSULTATION"
	RoleStructureEcriture     = "STRUCTURE_ECRITURE"
	RoleNotesEcriture         = "NOTES_ECRITURE"
	RoleJuryEcriture          = "JURY_ECRITURE"
	RoleProgrammeEcriture     = "PROGRAMME_ECRITURE"
	RoleSallesEcriture        = "SALLES_ECRITURE"
	RoleCertificationEcriture = "CERTIFICATION_ECRITURE"
	RoleUtilisateursEcriture  = "UTILISATEURS_ECRITURE"
	RoleAdmin                 = "ADMIN" // attribuable, jamais testé
)

// RolesFonctionnels est la liste des huit rôles que le composite ADMIN
// contient côté Keycloak. Exiger chacun d'eux (RequireAllRoles) équivaut à
// exiger ADMIN sans jamais tester son nom — conformément au modèle ci-dessus.
var RolesFonctionnels = []string{
	RoleConsultation,
	RoleStructureEcriture,
	RoleNotesEcriture,
	RoleJuryEcriture,
	RoleProgrammeEcriture,
	RoleSallesEcriture,
	RoleCertificationEcriture,
	RoleUtilisateursEcriture,
}

// AssignableRoles est la liste fermée des rôles que l'application accepte
// d'attribuer à un utilisateur. Toute entrée hors de cette liste est refusée :
// une entrée libre permettrait à un porteur d'UTILISATEURS_ECRITURE de
// s'octroyer n'importe quel droit du realm.
var AssignableRoles = []string{
	RoleConsultation,
	RoleStructureEcriture,
	RoleNotesEcriture,
	RoleJuryEcriture,
	RoleProgrammeEcriture,
	RoleSallesEcriture,
	RoleCertificationEcriture,
	RoleUtilisateursEcriture,
	RoleAdmin,
}

// IsAssignableRole indique si un rôle fait partie de la liste fermée.
func IsAssignableRole(role string) bool {
	return slices.Contains(AssignableRoles, role)
}

// RolesFromCtx retourne les rôles du jeton posés dans le contexte par
// AuthMiddleware, ou nil si la requête n'est pas passée par lui.
func RolesFromCtx(r *http.Request) []string {
	roles, _ := r.Context().Value(KeycloakRolesCtxKey).([]string)
	return roles
}

// RequireRole n'autorise la requête que si le jeton porte AU MOINS UN des
// rôles donnés (sémantique OU, comme AuthMiddleware — les rôles ne se cumulent
// pas). Il suppose qu'AuthMiddleware a déjà été appliqué en amont du groupe de
// routes : c'est lui qui vérifie le jeton et pose les rôles dans le contexte.
// Sans lui, aucun rôle n'est présent et la requête est refusée.
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !hasAllowedRole(RolesFromCtx(r), allowedRoles) {
				AuthorizationError(w, r, "droit insuffisant", INSUFFICIENT_RIGHTS, nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireAllRoles n'autorise la requête que si le jeton porte TOUS les rôles
// donnés (sémantique ET, à l'inverse de RequireRole). Avec RolesFonctionnels,
// c'est l'expression du composite ADMIN sans test de son nom : seules les
// routes de la corbeille l'utilisent.
func RequireAllRoles(requiredRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userRoles := RolesFromCtx(r)
			for _, role := range requiredRoles {
				if !slices.Contains(userRoles, role) {
					AuthorizationError(w, r, "droit insuffisant", INSUFFICIENT_RIGHTS, nil)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// SubFromCtx retourne le sujet Keycloak (l'identifiant de l'utilisateur) posé
// dans le contexte par AuthMiddleware, ou une chaîne vide sans lui.
func SubFromCtx(r *http.Request) string {
	sub, _ := r.Context().Value(KeycloakSubCtxKey).(string)
	return sub
}
