package registre

// Provenance : rex-imt (backend/admin/pkg/presence/scheduler.go), porté à
// l'identique — logs en slog (l'idiome du serveur) au lieu de log.Printf.

import (
	"context"
	"cyb-react/pkg/services"
	"log/slog"
	"time"
)

// anchorInterval : période de l'ancrage automatique. Elle borne aussi la
// fenêtre non couverte par le témoin externe : entre deux ancrages, seul le
// chaînage interne garantit l'intégrité (voir docs/rgpd-registre.md).
const anchorInterval = 1 * time.Hour

// StartAnchorScheduler lance l'ancrage TSA automatique toutes les heures en
// arrière-plan, suivi de l'envoi du témoin externe pour chaque nouvelle ancre.
// Une première exécution est déclenchée immédiatement au démarrage.
//
// Si la tête de chaîne n'a pas bougé depuis le dernier passage, AnchorLast ne
// crée aucune ancre (idempotence par registre_seq + tsa_url) et aucun e-mail
// n'est envoyé.
//
// L'ancrage OBSERVE la chaîne, il ne la gouverne pas : tout échec ici se
// logue et n'atteint jamais une écriture de note ou de jury.
func StartAnchorScheduler(pgCfg *services.DatabaseConfig, cfg services.RegistreConfig) {
	if !cfg.Timestamp.Enabled {
		slog.Info("[anchor] horodatage TSA désactivé, ancrage automatique inactif")
		return
	}

	pool := services.NewPG(context.Background(), services.ToDBS(pgCfg))

	go func() {
		runAnchor(pool, cfg)
		ticker := time.NewTicker(anchorInterval)
		defer ticker.Stop()
		for range ticker.C {
			runAnchor(pool, cfg)
		}
	}()
}

func runAnchor(pool *services.Postgres, cfg services.RegistreConfig) {
	ctx := context.Background()

	results, err := AnchorLast(ctx, pool.Db, cfg.Timestamp)
	if err != nil {
		slog.Error("[anchor] erreur ancrage automatique", "err", err)
		return
	}

	created := 0
	for _, res := range results {
		if res.Err != nil {
			slog.Error("[anchor] échec TSA", "tsa", res.TSAURL, "err", res.Err)
			continue
		}
		if res.Created {
			created++
			slog.Info("[anchor] nouvelle ancre", "id", res.AnchorID, "tsa", res.TSAURL)
		}
	}
	if created == 0 {
		return // tête de chaîne inchangée ou déjà ancrée : rien à témoigner
	}

	SendWitnesses(ctx, pool.Db, cfg.Witness, results)
}
