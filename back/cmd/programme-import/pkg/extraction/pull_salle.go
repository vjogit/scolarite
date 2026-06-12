package extraction

import "fmt"

type SallePull struct {
	SA       string
	NOM      string
	CAPACITE string
	TYPE     string
}

func ExtractSalle(content string) ([]SallePull, error) {
	return getItems(content, createSalle)
}

func createSalle(items []string) *SallePull {
	if items[0] != "SA" {
		return nil
	}
	salle := SallePull{}
	for i := 0; i < len(items); i++ {
		switch items[i] {
		case "SA":
			salle.SA = items[i+1]

		case "NOM":
			salle.NOM = items[i+1]

		case "CAPACITE":
			salle.CAPACITE = items[i+1]

		case "TYPE":
			salle.TYPE = items[i+1]

		default:
			fmt.Println("inconnu: ", items[i])
		}

		i++
	}

	return &salle
}
