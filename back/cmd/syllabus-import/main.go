// Commande syllabus-import — import du contenu du système syllabus tiers
// (lot 4) : fiches des matières, descriptions d'UE, matrices de compétences,
// depuis l'export à plat en CSV et ses fichiers de correspondance.
//
// Même configuration que le serveur (config.yaml, ${VAR} résolues depuis
// l'environnement : sourcer infra/env/config-local.env et secrets-local.env,
// ce que fait la cible make). Simulation par défaut — rien n'est écrit sans
// --apply ; --force assume le remplacement de ce qui existe déjà et diffère.
// Le rapport, identique dans les deux modes, s'écrit à côté de l'entrée.
// Mode d'emploi : docs/syllabus-import.md.
package main

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/legacy"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func main() {
	config := flag.String("config", "./cmd/serveur/config.yaml", "configuration du serveur (base de données)")
	dossier := flag.String("dossier", "./cmd/syllabus-import/data", "dossier des CSV de l'export et des correspondances")
	exceptions := flag.String("exceptions", "", "fichier d'exceptions d'appariement (défaut : exceptions.csv du dossier, s'il existe)")
	rapport := flag.String("rapport", "", "chemin du rapport (défaut : rapport-<mode>-<horodatage>.txt dans le dossier)")
	apply := flag.Bool("apply", false, "écrire en base (sans ce drapeau : simulation complète, aucune écriture)")
	force := flag.Bool("force", false, "remplacer les fiches, descriptions et matrices déjà écrites qui diffèrent (n'implique pas --apply)")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage : syllabus-import [--config chemin] [--dossier chemin] [--exceptions chemin] [--rapport chemin] [--apply] [--force]")
		flag.PrintDefaults()
	}
	flag.Parse()

	cfg, err := services.LoadConfigYaml[services.Config](*config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "configuration illisible (%s) : %v\n", *config, err)
		os.Exit(1)
	}

	entree, err := legacy.LireDossier(*dossier, *exceptions)
	if err != nil {
		fmt.Fprintf(os.Stderr, "entrée illisible : %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool := services.NewPG(ctx, services.ToDBS(&cfg.Database))
	defer pool.Db.Close()

	r, err := legacy.Importer(ctx, pool.Db, entree, legacy.Options{Apply: *apply, Force: *force, Dossier: *dossier})
	if err != nil {
		fmt.Fprintf(os.Stderr, "import interrompu : %v\n", err)
		os.Exit(1)
	}

	chemin := *rapport
	if chemin == "" {
		mode := "simulation"
		if *apply {
			mode = "import"
		}
		chemin = filepath.Join(*dossier, fmt.Sprintf("rapport-%s-%s.txt", mode, r.Date.Format("20060102-150405")))
	}
	f, err := os.Create(chemin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "rapport inécrivable (%s) : %v\n", chemin, err)
		os.Exit(1)
	}
	if err := r.Ecrire(f); err != nil {
		fmt.Fprintf(os.Stderr, "rapport inécrivable (%s) : %v\n", chemin, err)
		os.Exit(1)
	}
	_ = f.Close()

	// À l'écran : les totaux et le chemin du rapport, pas les listes.
	mode := "SIMULATION — aucune écriture"
	if *apply {
		mode = "APPLICATION — base écrite"
	}
	fmt.Printf("Import du syllabus tiers — %s (--force : %v)\n", mode, *force)
	fmt.Printf("Fiches : %d importée(s), %d inchangée(s), %d rejetée(s)\n", r.Fiches.Importes, r.Fiches.Inchanges, r.Fiches.Rejetes)
	fmt.Printf("Descriptions d'UE : %d importée(s), %d inchangée(s), %d rejetée(s)\n", r.Descriptions.Importes, r.Descriptions.Inchanges, r.Descriptions.Rejetes)
	fmt.Printf("Matrices : %d importée(s), %d inchangée(s), %d rejetée(s)\n", r.Matrices.Importes, r.Matrices.Inchanges, r.Matrices.Rejetes)
	fmt.Printf("Rejets : %d — Signalements : %d\n", r.TotalRejets(), len(r.Signalements))
	fmt.Printf("Rapport : %s (%s)\n", chemin, time.Since(r.Date).Round(time.Millisecond))
}
