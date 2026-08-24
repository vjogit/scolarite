// Commande ancrage — déclenche un passage d'ancrage RFC 3161 immédiat, sans
// attendre le ticker horaire de l'ordonnanceur : `make ancrer`.
//
// Même configuration que le serveur (config.yaml passé en argument, ${VAR}
// résolues depuis l'environnement — sourcer infra/env/config-local.env et
// secrets-local.env avant l'appel, ce que fait la cible make). La garde
// d'idempotence s'applique : tête de chaîne inchangée = aucune ancre, aucune
// requête TSA, aucun témoin.
package main

import (
	"context"
	"cyb-react/pkg/registre"
	"cyb-react/pkg/services"
	"fmt"
	"log/slog"
	"os"
)

func main() {
	configPath := "./config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := services.LoadConfigYaml[services.Config](configPath)
	if err != nil {
		slog.Error("Erreur chargement config YAML", "erreur", err)
		os.Exit(1)
	}

	if !cfg.Registre.Timestamp.Enabled {
		fmt.Println("Ancrage TSA désactivé (registre.timestamp.enabled) : rien à faire.")
		return
	}

	ctx := context.Background()
	pool := services.NewPG(ctx, services.ToDBS(&cfg.Database))

	results, err := registre.AnchorLast(ctx, pool.Db, cfg.Registre.Timestamp)
	if err != nil {
		slog.Error("Échec du passage d'ancrage", "err", err)
		os.Exit(1)
	}
	if len(results) == 0 {
		fmt.Println("Registre vide : rien à ancrer.")
		return
	}

	registre.SendWitnesses(ctx, pool.Db, cfg.Registre.Witness, results)

	echecs := 0
	for _, res := range results {
		switch {
		case res.Err != nil:
			echecs++
			fmt.Printf("✗ %s : %v\n", res.TSAURL, res.Err)
		case res.Created:
			fmt.Printf("✓ %s : nouvelle ancre id=%d\n", res.TSAURL, res.AnchorID)
		default:
			fmt.Printf("= %s : tête de chaîne déjà ancrée (ancre id=%d), rien à faire\n", res.TSAURL, res.AnchorID)
		}
	}
	if echecs == len(results) {
		os.Exit(1) // toutes les TSA en échec : le passage n'a rien produit
	}
}
