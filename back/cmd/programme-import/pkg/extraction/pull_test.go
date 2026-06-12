package extraction

import (
	"fmt"
	"log"
	"os"
	"testing"
	"time"

	"cyb-react/cmd/programme-import/pkg/utils"
)

func TestExtractionSalle(t *testing.T) {
	content, err := os.ReadFile("test_salle.csv")
	if err != nil {
		log.Fatal(err)
	}

	salles, err := ExtractSalle(string(content))
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("salles extraites:", len(salles))
}

func TestExtractionProf(t *testing.T) {
	content, err := os.ReadFile("test_prof.csv")
	if err != nil {
		log.Fatal(err)
	}

	profs, err := ExtractProf(string(content))
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("profs extraits:", len(profs))
}

func TestExtractionCours(t *testing.T) {
	content, err := os.ReadFile("test_cours.csv")
	if err != nil {
		log.Fatal(err)
	}

	cours, err := ExtractCours(string(content))
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("cours extraits:", len(cours))
}

func TestExtractionPromo(t *testing.T) {
	content, err := os.ReadFile("test_promo.csv")
	if err != nil {
		log.Fatal(err)
	}

	promos, err := ExtractPromo(string(content))
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("promos extraites:", len(promos))
}

func TestExtractionResa(t *testing.T) {
	start := time.Now()

	content, err := os.ReadFile("test_resa.csv")
	if err != nil {
		log.Fatal(err)
	}

	reservations, err := ExtractReservation(string(content))
	if err != nil {
		t.Fatalf("%v", err)
		return
	}

	end := time.Now()
	fmt.Println("réservations extraites:", len(reservations), "en", end.UnixMilli()-start.UnixMilli(), "ms")
}

func TestAA(t *testing.T) {
	// Définir les dates de début et de fin
	startDate := time.Date(2024, time.September, 15, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2025, time.June, 10, 0, 0, 0, 0, time.UTC)

	// Par mois, manque des données
	periodes, err := utils.GetWeeksBetweenDates(startDate, endDate)
	if err != nil {
		log.Fatal(err)
	}

	for _, p := range periodes {
		// Afficher la période du mois
		start := p.Start.Format("20060102")
		end := p.End.Format("20060102")
		fmt.Printf("Début : %s, Fin : %s\n", start, end)
	}
}
