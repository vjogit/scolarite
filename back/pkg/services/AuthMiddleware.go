package services

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"slices"
	"sync"

	"github.com/coreos/go-oidc"
)

func hasAllowedRole(userRoles []string, allowedRoles []string) bool {
	for _, r := range userRoles {
		if slices.Contains(allowedRoles, r) {
			return true
		}
	}
	return false
}

func AuthMiddleware(cfg *KeycloakConfig, allowedRoles ...string) func(http.Handler) http.Handler {
	oidcBase := cfg.Host
	if cfg.Issuer != "" {
		oidcBase = cfg.Issuer
	}
	issuer := fmt.Sprintf("%s/%s", oidcBase, cfg.Realm)

	httpClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	var (
		mu       sync.Mutex
		verifier *oidc.IDTokenVerifier
	)

	// Initialisation lazye : connexion à Keycloak à la première requête,
	// pas au démarrage (évite le deadlock avec nginx qui démarre après le backend).
	getVerifier := func() (*oidc.IDTokenVerifier, error) {
		mu.Lock()
		defer mu.Unlock()
		if verifier != nil {
			return verifier, nil
		}
		ctx := oidc.ClientContext(context.Background(), httpClient)
		provider, err := oidc.NewProvider(ctx, issuer)
		if err != nil {
			return nil, err
		}
		verifier = provider.Verifier(&oidc.Config{ClientID: cfg.Client})
		return verifier, nil
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			v, err := getVerifier()
			if err != nil {
				http.Error(w, "Service d'authentification indisponible", http.StatusServiceUnavailable)
				return
			}

			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || len(authHeader) < 7 || authHeader[:7] != "Bearer " {
				http.Error(w, "Jeton non fourni", http.StatusUnauthorized)
				return
			}
			rawToken := authHeader[7:]

			idToken, err := v.Verify(r.Context(), rawToken)
			if err != nil {
				fmt.Println(err)
				http.Error(w, "Jeton invalide ou expiré", http.StatusUnauthorized)
				return
			}

			var claims struct {
				Subject     string `json:"sub"`
				RealmAccess struct {
					Roles []string `json:"roles"`
				} `json:"realm_access"`
			}
			if err := idToken.Claims(&claims); err != nil {
				http.Error(w, "Impossible d'extraire les claims", http.StatusInternalServerError)
				return
			}

			if len(allowedRoles) > 0 && !hasAllowedRole(claims.RealmAccess.Roles, allowedRoles) {
				AuthorizationError(w, r, "droit insuffisant", INSUFFICIENT_RIGHTS, nil)
				return
			}

			ctx := context.WithValue(r.Context(), "keycloak_sub", claims.Subject)
			ctx = context.WithValue(ctx, "keycloak_roles", claims.RealmAccess.Roles)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
