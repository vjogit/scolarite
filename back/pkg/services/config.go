package services

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Database DatabaseConfig `yaml:"database"`
	Server   ServerConfig   `yaml:"server"`
	Keycloak KeycloakConfig `yaml:"keycloak"`
}

type DatabaseConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	Name     string `yaml:"name"`
}

type ServerConfig struct {
	Host string `yaml:"host"`
	Port int    `yaml:"port"`
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
