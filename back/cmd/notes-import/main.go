package main

import (
	"context"
	"cyb-react/cmd/notes-import/eleve"
	"cyb-react/cmd/notes-import/exercice"
	"cyb-react/cmd/notes-import/promo"
	"cyb-react/cmd/notes-import/realisation"
	"cyb-react/cmd/notes-import/services"
	se "cyb-react/pkg/services"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Parser struct {
	parsePromo    promo.ParserFunc
	parseExercice exercice.AssignmentStrategy
}

// Helper pour créer la struct sans répétition
func newParser(pm promo.ParserFunc, pe exercice.AssignmentStrategy) Parser {
	return Parser{
		parsePromo:    pm,
		parseExercice: pe,
	}
}

func main() {
	configPath := flag.String("config", "config.yaml", "Chemin vers le fichier de configuration")
	saveDB := flag.Bool("save", true, "Activer la sauvegarde en base de données")
	flag.Parse()

	cfg, err := se.LoadConfigYaml[services.Config](*configPath)
	if err != nil {
		log.Fatalf("Erreur chargement config : %v", err)
	}

	// Connexion à la base de données PostgreSQL
	ctx := context.Background()
	db, err := pgxpool.New(ctx, cfg.Import.Postgres)
	if err != nil {
		log.Fatalf("Erreur connexion PostgreSQL: %v", err)
	}
	defer db.Close()
	eleve.Import_eleve(cfg)

	// L'initialisation devient beaucoup plus claire
	parsers := map[string]Parser{
		// "FORMATION CONTINUE DIPLOMANTE": newParser(promo.ParseFCD, exercice.StrategyPatternFCD),
		// "EERIE":             newParser(promo.ParseEERIE, exercice.StrategyPatternEERIE),
		// "CMGD":              newParser(promo.ParseCMGD, exercice.StrategyPatternCMGD),
		// "LGEI":              newParser(promo.ParseLGEI, exercice.StrategyPatternLGEI),
		// "CYCLE D'OUVERTURE": newParser(promo.ParseOuverture, exercice.StrategyPatternCYCLEDOUVERTURE),
		// "BAT":               newParser(promo.ParseBAT, exercice.StrategyPatternBAT),
		"INFRES": newParser(promo.ParseINFRES, exercice.StrategyPatternINFRES),
		// "MECATRONIQUE":      newParser(promo.ParseMECATRONIQUE, exercice.StrategyPatternMECATRONIQUE),

		// // rien a faire a priori. Ne peux pas ventiler a minima des controles dans les UE.

		// "GRADUATE SCHOOL": newParser(promo.ParseGraduateSchool, exercice.StrategySimple),
		// "NUCLEAIRE":       newParser(promo.ParseNUCLEAIRE, exercice.StrategySimple),
		// "MASTER":          newParser(promo.ParseMASTER, exercice.StrategySimple),
		// "CESSEM":          newParser(promo.ParseCESSEM, exercice.StrategySimple),
	}

	// Injection du flag de sauvegarde dans le contexte
	ctx = context.WithValue(ctx, "saveDB", *saveDB)

	// 3. Boucle principale simplifiée
	for niveauNom, parser := range parsers {
		processLevel(ctx, cfg, db, niveauNom, parser)
	}

}

// processLevel encapsule la logique d'affichage et de récupération pour éviter le "deep nesting"
func processLevel(ctx context.Context, cfg *services.Config, db *pgxpool.Pool, niveauNom string, parser Parser) {
	// Création du fichier de log pour le niveau
	logDir := "logs"
	if err := os.MkdirAll(logDir, 0755); err != nil {
		log.Printf("Erreur lors de la création du dossier de logs : %v", err)
	}

	var w io.Writer = os.Stdout
	filename := fmt.Sprintf("%s.log", strings.ReplaceAll(niveauNom, " ", "_"))
	logFile, err := os.Create(filepath.Join(logDir, filename))
	if err != nil {
		log.Printf("Erreur lors de la création du fichier de log pour %s : %v", niveauNom, err)
	} else {
		defer logFile.Close()
		w = io.MultiWriter(os.Stdout, logFile)
	}

	fmt.Fprintf(w, "\n*** Traitement du niveau : %s ***\n", niveauNom)
	promos := promo.Import_promo(cfg, niveauNom, parser.parsePromo)

	for _, p := range promos {
		printPromoHeader(w, p)

		// Sauvegarde de la promotion dans PostgreSQL
		semestreID, err := promo.SavePromotion(ctx, db, p)
		if err != nil {
			log.Printf("Erreur lors de la sauvegarde de la promotion %s : %v", p.OriginalName, err)
			continue // On passe à la suivante si la promo/semestre n'est pas sauvegardée
		}

		// Traitement des exercices
		ues := exercice.GetExercices(cfg, p.P0CLEUNIK, parser.parseExercice)

		for _, ue := range ues {
			fmt.Fprintf(w, "\n   >>> UE : %s (ID: %d, ECTS: %.1f)\n", ue.UE, ue.CTCLEUNIK, ue.ECTS)
			// Sauvegarde des UEs, Matières et Contrôles
			ueID, err := promo.SaveUE(ctx, db, semestreID, ue)
			if err != nil {
				log.Printf("Erreur lors de la sauvegarde de l'UE %s : %v", ue.UE, err)
				continue
			}
			for _, ex := range ue.Excercice {
				fmt.Fprintf(w, "      - CONTROLE : %s (ID: %d, Coeff: %.2f)\n", ex.Nom, ex.CTCLEUNIK, ex.Coefficient)
				controleID, err := exercice.SaveExercice(ctx, db, ueID, ex)
				//_, err := exercice.SaveExercice(ctx, db, ueID, ex)
				if err != nil {
					log.Printf("Erreur lors de la sauvegarde de l'exercice %s : %v", ex.Nom, err)
					continue
				}
				//Traitement des réalisations (si besoin)
				reals := realisation.GetRealisations(cfg, ex.CTCLEUNIK)
				//printRealisationsTable(w, reals)
				for _, real := range reals {
					err = realisation.SaveControle(ctx, db, controleID, real)
					if err != nil {
						log.Printf("Erreur lors de la sauvegarde des réalisations pour l'exercice %s : %v", ex.Nom, err)
					}
				}
			}
		}
	}

	err = majSequence(ctx, db)
	if err != nil {
		log.Printf("Erreur lors de la mise à jour de la séquence : %v", err)
	}
}

// Fonctions d'affichage purement cosmétiques pour alléger la logique métier
func printPromoHeader(w io.Writer, p promo.ParsedData) { // Remplace PromoStruct par le vrai type si besoin
	fmt.Fprintln(w, "\n"+strings.Repeat("=", 80))
	fmt.Fprintf(w, "PROMOTION : %s | %s |  %s | %s (ID: %d)\n", p.Promotion, p.Formation, p.Annee, p.Semestre, p.P0CLEUNIK)
	fmt.Fprintln(w, strings.Repeat("=", 80))
}

func printRealisationsTable(w io.Writer, reals []realisation.RealisationData) { // Remplace par le vrai type
	if len(reals) == 0 {
		return
	}
	fmt.Fprintf(w, "      %-10s | %-20s | %-5s | %-10s\n", "ID REAL.", "SUJET", "NOTE", "EVCLEUNIK")
	fmt.Fprintf(w, "      %s\n", strings.Repeat("-", 45))
	for _, real := range reals {
		fmt.Fprintf(w, "      %-10d | %-20s | %5.2f | %-10d \n", real.NOCLEUNIK, real.Sujet, real.Note, real.EVCLEUNIK)
	}
}

func majSequence(ctx context.Context, db *pgxpool.Pool) error {
	// Vérification du mode dry-run
	if save, ok := ctx.Value("saveDB").(bool); ok && !save {
		return nil
	}

	tables := []string{
		"controle",
		"formation",
		"matiere",
		"note",
		"option",
		"periode",
		"promotion",
		"unite_enseignement",
		`"user"`,
	}

	log.Println("Mise à jour des séquences PostgreSQL...")

	for _, table := range tables {
		query := fmt.Sprintf(`SELECT setval(pg_get_serial_sequence('%s', 'id'), coalesce(max(id), 0) + 1, false) FROM %s`, table, table)
		if _, err := db.Exec(ctx, query); err != nil {
			log.Printf("Attention : Impossible de mettre à jour la séquence pour la table %s : %v", table, err)
		}
	}

	return nil
}
