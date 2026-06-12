package main

import (
	"cyb-react/cmd/programme-import/pkg/extraction"
	"cyb-react/cmd/programme-import/pkg/importer"
	"cyb-react/cmd/programme-import/pkg/utils"
	se "cyb-react/pkg/services"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"time"
)

/*
Le plus simple est de rebondir sur un serveur interne de l'ecole pour aller sur webdfd.mines-ales.fr
  openvpn   --config /home/vjo/personnel-2025.ovpn
  ssh -L 8090:webdfd.mines-ales.fr:80 userde@vecu-etudiant.mines-ales.fr
et d'ajouter dans /etc/localhost
  127.0.0.1       webdfd.mines-ales.fr
*/

type Config struct {
	Webdfd struct {
		URL string `yaml:"url"`
	} `yaml:"webdfd"`
	Postgres struct {
		URL string `yaml:"url"`
	} `yaml:"postgres"`
}

func main() {
	configPath := flag.String("config", "config.yaml", "Chemin vers le fichier de configuration")
	fetch := flag.Bool("fetch", false, "Récupère les données depuis webdfd (nécessite VPN + tunnel SSH)")
	flag.Parse()

	cfg, err := se.LoadConfigYaml[Config](*configPath)
	if err != nil {
		log.Fatalf("Erreur chargement config : %v", err)
	}

	start := time.Now()

	if *fetch {
		if err := fetchAll(cfg.Webdfd.URL); err != nil {
			log.Fatalf("fetch : %v", err)
		}
	}

	if err := importAll(cfg.Postgres.URL); err != nil {
		log.Fatalf("import : %v", err)
	}

	fmt.Println("total:", time.Since(start).Milliseconds(), "ms")
}

func fetchAll(baseURL string) error {
	fmt.Println("── FETCH ──────────────────────────────────")

	if err := os.MkdirAll("data", 0755); err != nil {
		return err
	}

	fmt.Println("  groupes...")
	if err := FetchGroupes(baseURL); err != nil {
		return err
	}
	fmt.Println("  profs...")
	if err := FetchProfs(baseURL); err != nil {
		return err
	}
	fmt.Println("  promos...")
	if err := FetchPromos(baseURL); err != nil {
		return err
	}
	fmt.Println("  salles...")
	if err := FetchSalles(baseURL); err != nil {
		return err
	}
	fmt.Println("  cours...")
	if err := FetchCours(baseURL); err != nil {
		return err
	}
	fmt.Println("  réservations (long)...")
	if err := FetchReservations(baseURL); err != nil {
		return err
	}

	fmt.Println("── FETCH OK ───────────────────────────────")
	return nil
}

func importAll(dbURL string) error {
	fmt.Println("── IMPORT ─────────────────────────────────")

	fmt.Println("  profs...")
	if err := importer.ImportProfs(dbURL); err != nil {
		return err
	}
	fmt.Println("  salles...")
	if err := importer.ImportSalles(dbURL); err != nil {
		return err
	}
	fmt.Println("  réservations...")
	if err := importer.ImportReservations(dbURL); err != nil {
		return err
	}

	fmt.Println("── IMPORT OK ──────────────────────────────")
	return nil
}

func saveJSON(filename string, data any) error {
	f, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(data)
}

func FetchProfs(baseURL string) error {
	contentProf, err := extraction.GetData(baseURL + "/cybema/cgi-bin/cgiempt.exe?TYPE=profs_txt")
	if err != nil {
		return err
	}

	profs, err := extraction.ExtractProf(contentProf)
	if err != nil {
		return err
	}

	if err := saveJSON("data/profs.json", profs); err != nil {
		return err
	}

	fmt.Println("profs extraits:", len(profs))
	return nil
}

func FetchPromos(baseURL string) error {
	contentPromo, err := extraction.GetData(baseURL + "/cybema/cgi-bin/cgiempt.exe?TYPE=promos_txt")
	if err != nil {
		return err
	}

	promos, err := extraction.ExtractPromo(contentPromo)
	if err != nil {
		return err
	}

	if err := saveJSON("data/promos.json", promos); err != nil {
		return err
	}

	fmt.Println("promos extraites:", len(promos))
	return nil
}

func FetchSalles(baseURL string) error {
	contentSalles, err := extraction.GetData(baseURL + "/cybema/cgi-bin/cgiempt.exe?TYPE=salles_txt")
	if err != nil {
		return err
	}

	salles, err := extraction.ExtractSalle(contentSalles)
	if err != nil {
		return err
	}

	if err := saveJSON("data/salles.json", salles); err != nil {
		return err
	}

	fmt.Println("salles extraites:", len(salles))
	return nil
}

func FetchCours(baseURL string) error {
	contentCours, err := extraction.GetData(baseURL + "/cybema/cgi-bin/cgiempt.exe?TYPE=cours_txt")
	if err != nil {
		return err
	}

	cours, err := extraction.ExtractCours(contentCours)
	if err != nil {
		return err
	}

	if err := saveJSON("data/cours.json", cours); err != nil {
		return err
	}

	fmt.Println("cours extraits:", len(cours))
	return nil
}

func FetchGroupes(baseURL string) error {
	groupes, err := extraction.ExtractGroupe(baseURL)
	if err != nil {
		return err
	}

	if err := saveJSON("data/groupes.json", groupes); err != nil {
		return err
	}

	fmt.Println("groupes extraits:", len(groupes))
	return nil
}

func FetchReservations(baseURL string) error {
	startDate := time.Date(2025, time.September, 1, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)

	periodes, err := utils.GetWeeksBetweenDates(startDate, endDate)
	if err != nil {
		return err
	}

	var reservations []extraction.Reservation

	for _, p := range periodes {
		start := p.Start.Format("20060102")
		end := p.End.Format("20060102")
		fmt.Printf("Début : %s, Fin : %s\n", start, end)

		contentResa, err := extraction.GetData(baseURL + "/cybema/cgi-bin/cgiempt.exe?TYPE=planning_txt&DATEDEBUT=" + start + "&DATEFIN=" + end)
		if err != nil {
			return err
		}

		resas, err := extraction.ExtractReservation(contentResa)
		if err != nil {
			return err
		}
		reservations = append(reservations, resas...)

		fmt.Println("réservations extraites:", len(reservations))
		time.Sleep(1 * time.Second)
	}

	return saveJSON("data/reservations.json", reservations)
}
