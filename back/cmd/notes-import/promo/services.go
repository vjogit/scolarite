package promo

import "fmt"

// calculatePromoFIG centralise la logique de décalage pour FIG
func calculatePromoDecal(annee, semNum int) string {
	offset := 0 // Standard pour S5 Automne
	switch semNum {
	case 5:
		offset = 0
	case 6, 7:
		offset = 1
	case 8, 9:
		offset = 2
	case 10:
		offset = 3
	}

	return fmt.Sprintf("FIG-%d", annee-offset-1849)
}
