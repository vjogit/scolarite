package services

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"slices"
	"sync"
	"time"

	"github.com/coreos/go-oidc"
)

// KeycloakSubCtxKey is the context key for the Keycloak subject (user ID).
var KeycloakSubCtxKey = &ContextKey{"keycloak sub"}

// KeycloakRolesCtxKey is the context key for the Keycloak realm roles.
var KeycloakRolesCtxKey = &ContextKey{"keycloak roles"}

func hasAllowedRole(userRoles []string, allowedRoles []string) bool {
	for _, r := range userRoles {
		if slices.Contains(allowedRoles, r) {
			return true
		}
	}
	return false
}

// AuthMiddleware vérifie le jeton Bearer contre Keycloak (découverte OIDC puis
// signature via le JWKS) et pose le sujet et les rôles du realm dans le
// contexte. Si allowedRoles est non vide, il exige de plus qu'AU MOINS UN de
// ces rôles soit porté (sémantique OU : les rôles ne se cumulent pas).
// L'autorisation fine par sous-groupe de routes s'appuie sur RequireRole, qui
// relit les rôles posés ici.
func AuthMiddleware(cfg *KeycloakConfig, allowedRoles ...string) func(http.Handler) http.Handler {
	oidcBase := cfg.Host
	if cfg.Issuer != "" {
		oidcBase = cfg.Issuer
	}
	issuer := fmt.Sprintf("%s/%s", oidcBase, cfg.Realm)

	// Ce client récupère la configuration OIDC et le JWKS — les clés qui
	// valident chaque jeton. La vérification TLS par défaut est donc
	// indispensable : la désactiver permettrait à un intermédiaire de servir
	// son propre JWKS et de forger des jetons valides. Quand l'issuer est
	// servi par une CA interne (mkcert en local), elle est chargée
	// explicitement dans RootCAs via keycloak.ca_cert — jamais
	// d'InsecureSkipVerify.
	httpClient := &http.Client{
		Timeout: 10 * time.Second,
	}
	if cfg.CaCert != "" {
		if pem, err := os.ReadFile(cfg.CaCert); err != nil {
			slog.Error("CA interne illisible, poursuite avec les CA système", "path", cfg.CaCert, "err", err)
		} else {
			pool, err := x509.SystemCertPool()
			if err != nil || pool == nil {
				pool = x509.NewCertPool()
			}
			if !pool.AppendCertsFromPEM(pem) {
				slog.Error("CA interne invalide, poursuite avec les CA système", "path", cfg.CaCert)
			} else {
				httpClient.Transport = &http.Transport{
					TLSClientConfig: &tls.Config{RootCAs: pool},
				}
			}
		}
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
				// Sans cette trace, un issuer injoignable ou mal configuré ne
				// se manifeste que par un 503 nu, côté navigateur.
				slog.Error("découverte OIDC impossible", "issuer", issuer, "err", err)
				RenderError(w, r, http.StatusServiceUnavailable, NO_INFORMATION,
					"Service d'authentification indisponible", nil, "AuthMiddleware")
				return
			}

			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || len(authHeader) < 7 || authHeader[:7] != "Bearer " {
				AuthenticationError(w, r, "Jeton non fourni", NO_INFORMATION, nil)
				return
			}
			rawToken := authHeader[7:]

			idToken, err := v.Verify(r.Context(), rawToken)
			if err != nil {
				slog.Error("token verification failed", "err", err)
				AuthenticationError(w, r, "Jeton invalide ou expiré", NO_INFORMATION, nil)
				return
			}

			var claims struct {
				Subject     string `json:"sub"`
				RealmAccess struct {
					Roles []string `json:"roles"`
				} `json:"realm_access"`
			}
			if err := idToken.Claims(&claims); err != nil {
				ServerError(w, r, fmt.Errorf("extraction des claims impossible: %w", err))
				return
			}

			if len(allowedRoles) > 0 && !hasAllowedRole(claims.RealmAccess.Roles, allowedRoles) {
				AuthorizationError(w, r, "droit insuffisant", INSUFFICIENT_RIGHTS, nil)
				return
			}

			ctx := context.WithValue(r.Context(), KeycloakSubCtxKey, claims.Subject)
			ctx = context.WithValue(ctx, KeycloakRolesCtxKey, claims.RealmAccess.Roles)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
