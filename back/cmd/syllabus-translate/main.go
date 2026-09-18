// Commande syllabus-translate — traduction par campagne du contenu syllabus
// d'une promotion (lot 6) : fiches des matières et descriptions d'UE, du
// français vers l'anglais, par le modèle de langage configuré (pkg/ia).
//
// Même configuration que le serveur (config.yaml, ${VAR} résolues depuis
// l'environnement : sourcer infra/env/config-local.env et secrets-local.env,
// ce que fait la cible make). Simulation par défaut : le traducteur est
// appelé, rien n'est écrit sans --apply. Idempotente : ce qui est à jour n'est
// pas retraduit ; une traduction relue devenue périmée n'est pas écrasée sans
// --retraduire-relues. Le rapport et le comparatif (source et traduction côte
// à côte) s'écrivent dans --sortie. Mode d'emploi : docs/syllabus-traduction.md.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"cyb-react/pkg/ia/fournisseurs"
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/campagne"
	"cyb-react/pkg/syllabus/traduction"
)

func main() {
	config := flag.String("config", "./cmd/serveur/config.yaml", "configuration du serveur (base de données, blocs ia et rack)")
	promotion := flag.Int("promotion", 0, "identifiant de la promotion à traduire (obligatoire ; celui de son URL dans l'application)")
	langue := flag.String("langue", traduction.LangueEn, "langue cible")
	provider := flag.String("provider", "", "fournisseur IA (défaut : ia.provider de la configuration) — rack, factice")
	apply := flag.Bool("apply", false, "écrire en base (sans ce drapeau : simulation, le traducteur est appelé, aucune écriture)")
	relues := flag.Bool("retraduire-relues", false, "retraduire aussi les traductions relues devenues périmées (le statut « relue » se perd)")
	limite := flag.Int("limite", 0, "nombre maximal de fiches et descriptions envoyées au traducteur (0 : sans limite)")
	sortie := flag.String("sortie", "./cmd/syllabus-translate/data", "dossier du rapport et du comparatif")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage : syllabus-translate --promotion <id> [--config chemin] [--langue en] [--provider rack|factice] [--limite n] [--sortie dossier] [--apply] [--retraduire-relues]")
		flag.PrintDefaults()
	}
	flag.Parse()
	if *promotion <= 0 {
		flag.Usage()
		os.Exit(2)
	}

	cfg, err := services.LoadConfigYaml[services.Config](*config)
	if err != nil {
		arret("configuration illisible (%s) : %v", *config, err)
	}
	nom := cfg.IA.Provider
	if *provider != "" {
		nom = *provider
	}
	// Délai de campagne (ia.timeout), pas le délai interactif du serveur.
	connecteur, err := fournisseurs.Nouveau(nom, cfg.Rack, cfg.IA.Timeout, cfg.IA.TimeoutConnexion)
	if err != nil {
		arret("%v", err)
	}
	if connecteur == nil {
		arret("aucun fournisseur IA : renseigner ia.provider (IA_PROVIDER) ou passer --provider")
	}
	if nom == fournisseurs.Rack && cfg.Rack.APIKey == "" {
		arret("RACK_API_KEY est vide : la poser dans infra/env/secrets-<env>.env")
	}
	if err := os.MkdirAll(*sortie, 0o755); err != nil {
		arret("dossier de sortie inutilisable (%s) : %v", *sortie, err)
	}

	ctx := context.Background()
	pool := services.NewPG(ctx, services.ToDBS(&cfg.Database))
	defer pool.Db.Close()

	r, err := campagne.Traduire(ctx, pool.Db, &traduction.Traducteur{Connecteur: connecteur}, campagne.Options{
		PromotionID: int32(*promotion), Langue: *langue, Apply: *apply, RetraduireRelues: *relues, Limite: *limite,
	})
	if err != nil {
		arret("campagne interrompue : %v", err)
	}

	mode := "simulation"
	if *apply {
		mode = "traduction"
	}
	horodatage := r.Date.Format("20060102-150405")
	cheminRapport := filepath.Join(*sortie, fmt.Sprintf("rapport-%s-%s.txt", mode, horodatage))
	cheminComparatif := filepath.Join(*sortie, fmt.Sprintf("comparatif-%s-%s.md", mode, horodatage))
	ecrire(cheminRapport, r.Ecrire)
	ecrire(cheminComparatif, r.EcrireComparatif)

	// À l'écran : les totaux et les chemins, pas les listes.
	_ = r.Ecrire(entete{})
	fmt.Printf("Rapport : %s\nComparatif : %s (%s)\n", cheminRapport, cheminComparatif, time.Since(r.Date).Round(time.Millisecond))
	if r.TotalEchecs() > 0 {
		os.Exit(1)
	}
}

// entete n'affiche que l'en-tête et les totaux du rapport : jusqu'à la
// première section de liste.
type entete struct{}

func (entete) Write(p []byte) (int, error) {
	texte := string(p)
	for i := 0; i+3 < len(texte); i++ {
		if texte[i:i+4] == "\n\n==" {
			texte = texte[:i+1]
			break
		}
	}
	fmt.Print(texte)
	return len(p), nil
}

func ecrire(chemin string, rendre func(w io.Writer) error) {
	f, err := os.Create(chemin)
	if err != nil {
		arret("fichier inécrivable (%s) : %v", chemin, err)
	}
	defer f.Close()
	if err := rendre(f); err != nil {
		arret("fichier inécrivable (%s) : %v", chemin, err)
	}
}

func arret(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
