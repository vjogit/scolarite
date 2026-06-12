package main

import (
	"cyb-react/pkg/certification"
	"cyb-react/pkg/planning"
	"cyb-react/pkg/resultat"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure"
	"cyb-react/pkg/user"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Ces variables seront injectées au moment de la compilation

var (
	buildTime string
	version   string
)

func main() {
	// 1. Configuration du Handler (JSON pour faciliter le parsing par Loki/ELK)
	opts := &slog.HandlerOptions{
		Level: slog.LevelDebug, // On définit le niveau minimum
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, opts))

	// 2. Définir comme logger par défaut
	slog.SetDefault(logger)

	// Affiche les informations de compilation
	slog.Info("Application version: ", "version", version)
	slog.Info("Compilation time: ", "buildTime", buildTime)

	configPath := "./config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := services.LoadConfigYaml[services.Config](configPath)
	if err != nil {
		slog.Info("Erreur chargement config YAML :", "erreuer:", err)
		os.Exit(1)
	}

	r := chi.NewRouter()

	r.Use(middleware.Logger) // Log HTTP requests
	r.Use(services.DatabaseMiddleware(&cfg.Database))

	r.Route("/api/v0/structure", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak, "ADMIN"))
		structure.RouteStructure(r)
	})

	r.Route("/api/v0/resultat", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak, "ADMIN"))
		resultat.RouteResultat(r)
	})
	r.Route("/api/v0/certification", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak, "ADMIN"))
		certification.RouteToeic(r)
	})

	r.Route("/api/v0/user", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak, "ADMIN"))
		user.RouteUser(r, &cfg.Keycloak)
	})

	r.Route("/api/v0/planning", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak, "ADMIN"))
		planning.RoutePlanning(r)
	})

	slog.Info("Serveur démarré", "host", cfg.Server.Port, "port", cfg.Server.Host)
	error := http.ListenAndServe(
		fmt.Sprintf(":%d", cfg.Server.Port),
		r,
	)
	slog.Info("Serveur arrêté avec erreur", "error", error.Error())
}
