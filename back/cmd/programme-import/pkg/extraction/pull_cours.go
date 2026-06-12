package extraction

type Cours struct {
	CO  string
	NOM string
}

func ExtractCours(content string) ([]Cours, error) {
	return getItems(content, createCours)
}

func createCours(items []string) *Cours {
	if items[0] != "CO" {
		return nil
	}
	cours := Cours{}
	for i := 0; i < len(items); i++ {
		switch items[i] {
		case "CO":
			cours.CO = items[i+1]

		case "NOM":
			cours.NOM = items[i+1]
		}

		i++
	}

	return &cours
}
