package extraction

type Promo struct {
	P0  string
	NOM string
}

func ExtractPromo(content string) ([]Promo, error) {
	return getItems(content, createPromo)
}

func createPromo(items []string) *Promo {
	if items[0] != "P0" {
		return nil
	}
	promo := Promo{}
	for i := 0; i < len(items); i++ {
		switch items[i] {
		case "P0":
			promo.P0 = items[i+1]

		case "NOM":
			promo.NOM = items[i+1]
		}

		i++
	}

	return &promo
}
