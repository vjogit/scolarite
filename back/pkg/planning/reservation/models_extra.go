package reservation

import (
	"cyb-react/pkg/planning/reservation/gen"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
)

// ── Types des associations agrégées ─────────────────────────────────────────

type SalleRef struct {
	ID       int32   `json:"id"`
	Name     string  `json:"name"`
	Batiment *string `json:"batiment"`
}

type IntervenantRef struct {
	ID        int32   `json:"id"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
}

type GroupeRef struct {
	ID       int32  `json:"id"`
	Name     string `json:"name"`
	OptionID int32  `json:"option_id"`
}

// ── Struct d'entrée pour Create et Update ───────────────────────────────────
// Séparé du Row généré par sqlc : contient les IDs des associations
// au lieu des objets JSON agrégés.

type ReservationInput struct {
	ID             int32                            `json:"id"`
	Version        int32                            `json:"version"`
	Horaire        pgtype.Range[pgtype.Timestamptz] `json:"horaire"`
	PeriodeID      int32                            `json:"periode_id"`
	MatiereID      *int32                           `json:"matiere_id"`
	TypeCours      *string                          `json:"type_cours"`
	IsDistanciel   bool                             `json:"is_distanciel"`
	Description    *string                          `json:"description"`
	SalleIDs       []int32                          `json:"salle_ids"`
	IntervenantIDs []int32                          `json:"intervenant_ids"`
	GroupeIDs      []int32                          `json:"groupe_ids"`
}

// ── Struct de réponse enrichie ───────────────────────────────────────────────
// Remplace le Row brut généré par sqlc pour la sérialisation JSON finale.
// Les champs Salles/Intervenants/Groupes sont toujours des slices (jamais null).

type ReservationDetail struct {
	ID           int32                            `json:"id"`
	Version      int32                            `json:"version"`
	Horaire      pgtype.Range[pgtype.Timestamptz] `json:"horaire"`
	PeriodeID    int32                            `json:"periode_id"`
	MatiereID    *int32                           `json:"matiere_id"`
	MatiereName  *string                          `json:"matiere_name"`
	MatiereColor *string                          `json:"matiere_color"`
	TypeCours    *string                          `json:"type_cours"`
	IsDistanciel bool                             `json:"is_distanciel"`
	Description  *string                          `json:"description"`
	Salles       []SalleRef                       `json:"salles"`
	Intervenants []IntervenantRef                 `json:"intervenants"`
	Groupes      []GroupeRef                      `json:"groupes"`
}

// ParseReservationDetail convertit un FetchReservationByIDRow (sqlc) en
// ReservationDetail prêt à être sérialisé. Les champs NULL (aucune association)
// sont normalisés en slice vide.
func ParseReservationDetail(row gen.FetchReservationByIDRow) (ReservationDetail, error) {
	d := ReservationDetail{
		ID:           row.ID,
		Version:      row.Version,
		Horaire:      row.Horaire,
		PeriodeID:    row.PeriodeID,
		MatiereID:    row.MatiereID,
		MatiereName:  row.MatiereName,
		MatiereColor: row.MatiereColor,
		TypeCours:    row.TypeCours,
		IsDistanciel: row.IsDistanciel,
		Description:  row.Description,
		Salles:       []SalleRef{},
		Intervenants: []IntervenantRef{},
		Groupes:      []GroupeRef{},
	}

	if row.Salles != nil {
		if err := parseJSONField(row.Salles, &d.Salles); err != nil {
			return d, err
		}
	}
	if row.Intervenants != nil {
		if err := parseJSONField(row.Intervenants, &d.Intervenants); err != nil {
			return d, err
		}
	}
	if row.Groupes != nil {
		if err := parseJSONField(row.Groupes, &d.Groupes); err != nil {
			return d, err
		}
	}

	return d, nil
}

// parseJSONField désérialise un champ interface{} issu de json_agg vers dst.
// Si src est nil (aucune ligne agrégée), dst reste une slice vide.
func parseJSONField(src interface{}, dst interface{}) error {
	if src == nil {
		return nil
	}

	var data []byte
	switch v := src.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		var err error
		data, err = json.Marshal(src)
		if err != nil {
			return err
		}
	}
	return json.Unmarshal(data, dst)
}
