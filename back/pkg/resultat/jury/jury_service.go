package jury

import (
	"context"
	"fmt"

	"cyb-react/pkg/resultat/jury/gen"

	"github.com/xuri/excelize/v2"
)

// JuryService struct permet d'injecter facilement vos requêtes DB
type JuryService struct { //nolint:revive
	queries   *gen.Queries
	styles    map[ExcelStyle]int
	periodeID int32
}

// ExcelStyle représente les styles personnalisés pour Excel
type ExcelStyle string

// NewJuryService crée une nouvelle instance de JuryService
func NewJuryService(q *gen.Queries, periodeID int32) *JuryService {
	return &JuryService{queries: q, periodeID: periodeID}
}

// GenerateJury génère un fichier Excel avec la synthèse du jury.
// Cette fonction orchestre la récupération des données puis la création du fichier.
func (s *JuryService) GenerateJury(f *excelize.File) error {
	ctx := context.Background()

	// 1. Récupération et préparation des données
	juryData, err := s.PrepareJuryData(ctx)
	if err != nil {
		return fmt.Errorf("erreur lors de la préparation des données du jury: %w", err)
	}

	// 2. Génération du fichier Excel à partir des données
	return s.GenerateJuryExcel(f, juryData)
}
