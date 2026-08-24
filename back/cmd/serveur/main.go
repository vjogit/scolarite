package main

import (
	"cyb-react/pkg/certification"
	"cyb-react/pkg/corbeille"
	"cyb-react/pkg/planning"
	"cyb-react/pkg/registre"
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
	// La configuration d'abord : c'est elle qui porte le niveau de log
	// (log.level du config.yaml). Les erreurs d'ici utilisent le logger par
	// défaut de slog — il n'y a rien d'autre à ce stade.
	configPath := "./config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := services.LoadConfigYaml[services.Config](configPath)
	if err != nil {
		slog.Error("Erreur chargement config YAML", "erreur", err)
		os.Exit(1)
	}

	level, err := cfg.Log.SlogLevel()
	if err != nil {
		slog.Error("Configuration de log invalide", "erreur", err)
		os.Exit(1)
	}

	// Handler JSON pour faciliter le parsing par Loki/ELK.
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(logger)

	// Affiche les informations de compilation
	slog.Info("Application version: ", "version", version)
	slog.Info("Compilation time: ", "buildTime", buildTime)

	r := chi.NewRouter()

	r.Use(middleware.Logger) // Log HTTP requests
	r.Use(services.DatabaseMiddleware(&cfg.Database))

	// AuthMiddleware sans rôle : authentification seule (jeton vérifié, rôles
	// posés dans le contexte). L'autorisation est portée par chaque groupe de
	// routes via services.RequireRole — lecture pour CONSULTATION, écritures
	// par rôle de domaine. ADMIN n'est jamais testé : c'est un composite
	// Keycloak qui expose tous les rôles fonctionnels dans le jeton.
	r.Route("/api/v0/structure", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak))
		structure.RouteStructure(r)
	})

	r.Route("/api/v0/resultat", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak))
		resultat.RouteResultat(r)
	})
	r.Route("/api/v0/certification", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak))
		certification.RouteToeic(r)
	})

	r.Route("/api/v0/user", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak))
		user.RouteUser(r, &cfg.Keycloak)
	})

	r.Route("/api/v0/planning", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak))
		planning.RoutePlanning(r)
	})

	r.Route("/api/v0/registre", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak))
		registre.RouteRegistre(r, cfg.Registre)
	})

	r.Route("/api/v0/corbeille", func(r chi.Router) {
		r.Use(services.AuthMiddleware(&cfg.Keycloak))
		corbeille.RouteCorbeille(r)
	})

	// Ancrage RFC 3161 périodique du registre (portage rex-imt). L'ancrage
	// OBSERVE la chaîne, il ne la gouverne pas : un certificat racine absent ou
	// une TSA injoignable se loguent et n'empêchent ni le démarrage ni les
	// écritures métier. Le certificat racine s'obtient par un acte visible :
	// `make fetch-freetsa-cert`.
	if ca := cfg.Registre.Timestamp.CaCertPath; cfg.Registre.Timestamp.Enabled && ca != "" {
		if _, err := os.Stat(ca); err != nil {
			slog.Error("Certificat racine TSA introuvable : la vérification hors ligne des témoins échouera",
				"caCertPath", ca,
				"remede", "make fetch-freetsa-cert")
		}
	}
	registre.StartAnchorScheduler(&cfg.Database, cfg.Registre)

	slog.Info("Serveur démarré", "host", cfg.Server.Port, "port", cfg.Server.Host)
	error := http.ListenAndServe(
		fmt.Sprintf(":%d", cfg.Server.Port),
		r,
	)
	slog.Info("Serveur arrêté avec erreur", "error", error.Error())
}
