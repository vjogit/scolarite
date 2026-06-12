package extraction

import (
	"fmt"
	"time"
)

type Reservation struct {
	PL        string
	P0CLE     string
	PRCLE     string
	COCLE     string
	GRCLE     string
	SACLE     string
	DATE      string
	DATEMODIF string
	HD        string
	HF        string
	POSH      string
	POSB      string
	TYPE      string
	COURS     string
	SALLE     string
	PROMO     string
	PROF      string
	GROUPE    string
	NOTE      string
	CCOLORI   string
	CFOND     string
	CTEXTE    string
	PCOLORI   string
	PFOND     string
	PTEXTE    string
	LANOTE    string
}

func ExtractReservation(content string) ([]Reservation, error) {
	return getItems(content, createReservation)
}

func createReservation(items []string) *Reservation {
	if items[0] != "PL" {
		return nil
	}
	resa := Reservation{}
	for i := 0; i < len(items); i++ {
		switch items[i] {
		case "PL":
			resa.PL = items[i+1]
		case "P0CLE":
			resa.P0CLE = items[i+1]
		case "PRCLE":
			resa.PRCLE = items[i+1]
		case "COCLE":
			resa.COCLE = items[i+1]
		case "GRCLE":
			resa.GRCLE = items[i+1]
		case "SACLE":
			resa.SACLE = items[i+1]
		case "DATE":
			resa.DATE = items[i+1]
		case "DATEMODIF":
			resa.DATEMODIF = items[i+1]
		case "HD":
			resa.HD = items[i+1]
		case "HF":
			resa.HF = items[i+1]
		case "POSH":
			resa.POSH = items[i+1]
		case "POSB":
			resa.POSB = items[i+1]
		case "TYPE":
			resa.TYPE = items[i+1]
		case "COURS":
			resa.COURS = items[i+1]
		case "SALLE":
			resa.SALLE = items[i+1]
		case "PROMO":
			resa.PROMO = items[i+1]
		case "PROF":
			resa.PROF = items[i+1]
		case "GROUPE":
			resa.GROUPE = items[i+1]
		case "NOTE":
			resa.NOTE = items[i+1]
		case "CCOLORI":
			resa.CCOLORI = items[i+1]
		case "CFOND":
			resa.CFOND = items[i+1]
		case "CTEXTE":
			resa.CTEXTE = items[i+1]
		case "PCOLORI":
			resa.PCOLORI = items[i+1]
		case "PFOND":
			resa.PFOND = items[i+1]
		case "PTEXTE":
			resa.PTEXTE = items[i+1]
		case "LANOTE":
			resa.LANOTE = items[i+1]
		default:
			fmt.Println("inconnu: ", items[i])
		}

		i++
	}

	return &resa
}

func toTime(date string) (*time.Time, error) {
	fuseauHoraireLocal, _ := time.LoadLocation("Europe/Paris")
	dateHeure, err := time.ParseInLocation("20060102 1504", date, fuseauHoraireLocal)
	if err != nil {
		return nil, err
	}
	return &dateHeure, nil
}
