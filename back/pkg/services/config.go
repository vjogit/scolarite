package services

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Database DatabaseConfig `yaml:"database"`
	Server   ServerConfig   `yaml:"server"`
	Keycloak KeycloakConfig `yaml:"keycloak"`
	Log      LogConfig      `yaml:"log"`
	Registre RegistreConfig `yaml:"registre"`
}

// RegistreConfig porte l'étage d'ancrage externe du registre chaîné :
// horodatage RFC 3161 et témoin courriel. Provenance : rex-imt
// (backend/common/pkg/services/config.go, PresenceConfig) — même structure,
// sans le tokenSecret spécifique aux pointages.
type RegistreConfig struct {
	Timestamp TimestampConfig `yaml:"timestamp"`
	Witness   WitnessConfig   `yaml:"witness"`
}

// TimestampConfig configures RFC 3161 external anchoring.
// All fields have safe defaults; enabled=false when absent.
type TimestampConfig struct {
	Enabled       bool          `yaml:"enabled"`
	URLs          []string      `yaml:"urls"`          // TSA endpoints; defaults to FreeTSA if empty
	HashAlgorithm string        `yaml:"hashAlgorithm"` // "sha256" (only value currently supported)
	Timeout       time.Duration `yaml:"timeout"`       // per-TSA HTTP timeout, e.g. 10s
	CaCertPath    string        `yaml:"caCertPath"`    // path to TSA root CA PEM for offline verification
}

// WitnessConfig configures the external witness email sent after each new
// RFC 3161 anchor. The recipient mailbox MUST be controlled by a role distinct
// from the infrastructure administrators, and the application must only have
// send rights on it (see docs/rgpd-registre.md) — the code cannot enforce
// this; it is a deployment requirement.
type WitnessConfig struct {
	Enabled    bool       `yaml:"enabled"`
	Recipients []string   `yaml:"recipients"` // external mailboxes receiving the witness
	SMTP       SMTPConfig `yaml:"smtp"`
}

// SMTPConfig holds send-only SMTP parameters. Secrets come from env vars via
// the ${VAR} substitution done by LoadConfigYaml.
type SMTPConfig struct {
	Host     string        `yaml:"host"`
	Port     int           `yaml:"port"`
	Username string        `yaml:"username"`
	Password string        `yaml:"password"`
	From     string        `yaml:"from"`
	StartTLS bool          `yaml:"startTLS"` // upgrade the connection with STARTTLS before auth
	Timeout  time.Duration `yaml:"timeout"`  // network timeout, e.g. 10s
}

// DefaultTSAURL is used when TimestampConfig.URLs is empty.
const DefaultTSAURL = "https://freetsa.org/tsr"

// LogConfig porte le niveau minimum des logs : debug, info, warn ou error.
// Vide vaut info — le défaut sûr, un environnement doit demander debug
// explicitement plutôt que l'obtenir par oubli.
type LogConfig struct {
	Level string `yaml:"level"`
}

// SlogLevel traduit le niveau configuré. Une valeur inconnue est une erreur :
// la faute de frappe qui ferait tourner la prod en debug doit arrêter le
// démarrage, pas passer inaperçue.
func (l LogConfig) SlogLevel() (slog.Level, error) {
	switch strings.ToLower(strings.TrimSpace(l.Level)) {
	case "", "info":
		return slog.LevelInfo, nil
	case "debug":
		return slog.LevelDebug, nil
	case "warn":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("niveau de log inconnu : %q (attendu debug, info, warn ou error)", l.Level)
	}
}

type DatabaseConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	Name     string `yaml:"name"`
	// SSLMode : mode `sslmode` libpq (disable, require, verify-ca, verify-full).
	// Vide vaut disable — c'est aussi le comportement d'avant ce champ. Le
	// défaut sûr pour un environnement qui n'a pas encore de CA PostgreSQL
	// (chantier environnements) est verify-full, pas disable : voir
	// infra/env/config-prod.env.
	SSLMode string `yaml:"sslmode"`
	// SSLRootCert : chemin d'un bundle PEM de CA, requis par verify-ca et
	// verify-full. Ignoré pour disable/require.
	SSLRootCert string `yaml:"sslrootcert"`
}

type ServerConfig struct {
	Host string `yaml:"host"`
	Port int    `yaml:"port"`

	// Timeouts http.Server (lot sécurité réseau). Aucun défaut Go : le
	// config.yaml embarqué les porte tous en littéral, comme
	// registre.timestamp.hashAlgorithm — ce ne sont pas des valeurs qui
	// varient par environnement.
	ReadHeaderTimeout time.Duration `yaml:"readHeaderTimeout"`
	ReadTimeout       time.Duration `yaml:"readTimeout"`
	WriteTimeout      time.Duration `yaml:"writeTimeout"`
	IdleTimeout       time.Duration `yaml:"idleTimeout"`

	// MaxBodyBytes : plafond global de taille de requête (MaxBodyMiddleware),
	// au-delà des plafonds par route des imports (ParseMultipartForm). En
	// octets : pas d'unité lisible en YAML sans dépendance supplémentaire.
	MaxBodyBytes int64 `yaml:"maxBodyBytes"`
}

type KeycloakConfig struct {
	Host                  string `yaml:"host"`
	Issuer                string `yaml:"issuer"` // public URL for OIDC token validation (optional, defaults to Host)
	Realm                 string `yaml:"realm"`
	Client                string `yaml:"client"`
	Secret                string `yaml:"secret"`
	Backend_client_id     string `yaml:"backend_client_id"`
	Backend_client_secret string `yaml:"backend_client_secret"`
	// CaCert : chemin d'un bundle PEM ajouté aux CA de confiance pour les
	// appels OIDC (découverte + JWKS). Nécessaire quand l'issuer est servi
	// avec un certificat d'une CA interne (mkcert en local). La vérification
	// TLS reste toujours active : jamais d'InsecureSkipVerify.
	CaCert string `yaml:"ca_cert"`
}

func LoadConfigYaml[T any](path string) (*T, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	expanded := os.Expand(string(raw), os.Getenv)

	var cfg T
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
