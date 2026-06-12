package services

import (
	se "cyb-react/pkg/services"
)

type Config struct {
	Keycloak se.KeycloakConfig `yaml:"keycloak"`
	Import   struct {
		MariaDB  string `yaml:"mariadb"`
		Postgres string `yaml:"postgres"`
	} `yaml:"import"`
}
