package services_test

import (
	"strings"
	"testing"

	"cyb-react/pkg/services"
)

func TestToDBSSslModeDisableParDefaut(t *testing.T) {
	dsn := services.ToDBS(&services.DatabaseConfig{
		Host: "db", Port: 5432, User: "u", Password: "p", Name: "n",
	})
	if !strings.Contains(dsn, "sslmode=disable") {
		t.Errorf("sslmode vide devrait valoir disable, DSN = %q", dsn)
	}
	if strings.Contains(dsn, "sslrootcert=") {
		t.Errorf("sslrootcert absent ne devrait pas apparaître dans le DSN, DSN = %q", dsn)
	}
}

func TestToDBSSslModeRefleteLaConfig(t *testing.T) {
	dsn := services.ToDBS(&services.DatabaseConfig{
		Host: "db", Port: 5432, User: "u", Password: "p", Name: "n",
		SSLMode:     "verify-full",
		SSLRootCert: "/opt/scolarite/conf/postgres-ca.pem",
	})
	if !strings.Contains(dsn, "sslmode=verify-full") {
		t.Errorf("le DSN devrait porter le sslmode configuré, DSN = %q", dsn)
	}
	if !strings.Contains(dsn, "sslrootcert=/opt/scolarite/conf/postgres-ca.pem") {
		t.Errorf("le DSN devrait porter le sslrootcert configuré, DSN = %q", dsn)
	}
}
