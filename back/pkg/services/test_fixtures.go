package services

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// StructureFixture contient les identifiants du jeu de données d'intégration
// construit par SeedStructureFixture. Il sert aux tests des endpoints
// delete-impact : les décomptes attendus sont documentés sur chaque champ.
//
// Arborescence construite :
//
//	formation F
//	├── promotion P1 (1 TOEIC, 1 mobilité)
//	│   ├── option O1
//	│   │   ├── groupe G1 (1 élève affecté)
//	│   │   ├── periode PE1
//	│   │   │   └── ue U1 → matiere M1 → controle C1 (2 notes) + controle C2 (1 note)
//	│   │   │   └── reservation R1 (matière M1, 1 intervenant, 1 salle, 1 groupe)
//	│   │   └── periode PE2
//	│   │       └── reservation R2 (matière M1, aucune association)
//	│   └── option O2 (vide)
//	└── promotion P2 (vide)
type StructureFixture struct {
	FormationID   int32
	PromotionID   int32 // P1
	PromotionVide int32 // P2
	OptionID      int32 // O1
	OptionVide    int32 // O2
	PeriodeID     int32 // PE1
	PeriodeAutre  int32 // PE2
	UeID          int32
	MatiereID     int32
	ControleID    int32 // C1
	GroupeID      int32
	SalleID       int32
	UserIDs       []int32
	ReservationID int32 // R1
	ReservationR2 int32 // R2
}

// SeedStructureFixture vide les tables de structure puis insère le jeu de
// données ci-dessus. Le nettoyage est réenclenché par le test suivant : chaque
// appel commence par un TRUNCATE.
func SeedStructureFixture(t *testing.T, pool *pgxpool.Pool, suffixe string) StructureFixture {
	t.Helper()
	ctx := context.Background()
	f := StructureFixture{}

	_, err := pool.Exec(ctx, `TRUNCATE TABLE formation, public."user", salle CASCADE`)
	if err != nil {
		t.Fatalf("truncate impossible : %v", err)
	}

	debut := time.Date(2026, 9, 1, 8, 0, 0, 0, time.UTC)
	fin := debut.Add(180 * 24 * time.Hour)

	exec := func(query string, args ...any) int32 {
		t.Helper()
		var id int32
		if err := pool.QueryRow(ctx, query, args...).Scan(&id); err != nil {
			t.Fatalf("insertion impossible (%s) : %v", query, err)
		}
		return id
	}

	f.FormationID = exec(
		`INSERT INTO formation (name, version) VALUES ($1, 1) RETURNING id`,
		"Formation "+suffixe)

	insertPromotion := func(nom string) int32 {
		return exec(`INSERT INTO promotion (name, version, debut, fin, echelle_gpa, echelle, formation_id)
			VALUES ($1, 1, $2, $3, '{4,3,2,1,0.5,0}', '{16,14,12,10,8}', $4) RETURNING id`,
			nom, debut, fin, f.FormationID)
	}
	f.PromotionID = insertPromotion("Promo 1 " + suffixe)
	f.PromotionVide = insertPromotion("Promo 2 " + suffixe)

	f.OptionID = exec(`INSERT INTO option (name, version, promotion_id) VALUES ($1, 1, $2) RETURNING id`,
		"Option 1 "+suffixe, f.PromotionID)
	f.OptionVide = exec(`INSERT INTO option (name, version, promotion_id) VALUES ($1, 1, $2) RETURNING id`,
		"Option 2 "+suffixe, f.PromotionID)

	f.PeriodeID = exec(`INSERT INTO periode (name, version, debut, fin, option_id) VALUES ($1, 1, $2, $3, $4) RETURNING id`,
		"Periode 1 "+suffixe, debut, fin, f.OptionID)
	f.PeriodeAutre = exec(`INSERT INTO periode (name, version, debut, fin, option_id) VALUES ($1, 1, $2, $3, $4) RETURNING id`,
		"Periode 2 "+suffixe, debut, fin, f.OptionID)

	f.UeID = exec(`INSERT INTO unite_enseignement (name, version, ects, periode_id) VALUES ($1, 1, 4, $2) RETURNING id`,
		"UE 1 "+suffixe, f.PeriodeID)
	f.MatiereID = exec(`INSERT INTO matiere (name, version, heure, coeff, unite_enseignement_id) VALUES ($1, 1, 20, 1, $2) RETURNING id`,
		"Matiere 1 "+suffixe, f.UeID)

	f.ControleID = exec(`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ($1, 1, 1, $2) RETURNING id`,
		"Controle 1 "+suffixe, f.MatiereID)
	controle2 := exec(`INSERT INTO controle (name, version, coeff, matiere_id) VALUES ($1, 1, 1, $2) RETURNING id`,
		"Controle 2 "+suffixe, f.MatiereID)

	for i := 1; i <= 2; i++ {
		id := exec(`INSERT INTO public."user" (version, "firstName", "lastName", email, keycloak_id, type_personne)
			VALUES (1, $1, $2, $3, $4, 'ELEVE') RETURNING id`,
			"Prenom", "Nom", "eleve"+suffixe+string(rune('0'+i))+"@example.org", "kc-"+suffixe+string(rune('0'+i)))
		f.UserIDs = append(f.UserIDs, id)
	}

	// 3 notes : 2 sur le contrôle C1, 1 sur le contrôle C2.
	exec(`INSERT INTO note (version, note, user_id, controle_id) VALUES (1, 12, $1, $2) RETURNING id`, f.UserIDs[0], f.ControleID)
	exec(`INSERT INTO note (version, note, user_id, controle_id) VALUES (1, 14, $1, $2) RETURNING id`, f.UserIDs[1], f.ControleID)
	exec(`INSERT INTO note (version, note, user_id, controle_id) VALUES (1, 8, $1, $2) RETURNING id`, f.UserIDs[0], controle2)

	// Certifications rattachées à la promotion P1.
	exec(`INSERT INTO toeic (version, score, date_passage, promotion_id, user_id) VALUES (1, 800, $1, $2, $3) RETURNING id`,
		debut, f.PromotionID, f.UserIDs[0])
	exec(`INSERT INTO mobilite_internationale (version, pays, date_debut, date_fin, promotion_id, user_id)
		VALUES (1, 'Irlande', $1, $2, $3, $4) RETURNING id`, debut, fin, f.PromotionID, f.UserIDs[0])

	// Groupe rattaché à l'option O1, avec un élève affecté.
	f.GroupeID = exec(`INSERT INTO groupe (name, version, option_id) VALUES ($1, 1, $2) RETURNING id`,
		"Groupe 1 "+suffixe, f.OptionID)
	if _, err := pool.Exec(ctx, `INSERT INTO groupe_user (groupe_id, user_id) VALUES ($1, $2)`, f.GroupeID, f.UserIDs[0]); err != nil {
		t.Fatalf("insertion groupe_user impossible : %v", err)
	}

	f.SalleID = exec(`INSERT INTO salle (name, version, capacite) VALUES ($1, 1, 30) RETURNING id`, "Salle "+suffixe)

	// R1 sur PE1 : sera supprimée avec PE1.
	f.ReservationID = exec(`INSERT INTO reservation (version, horaire, periode_id, matiere_id)
		VALUES (1, tstzrange($1, $2, '[)'), $3, $4) RETURNING id`,
		debut, debut.Add(2*time.Hour), f.PeriodeID, f.MatiereID)
	if _, err := pool.Exec(ctx, `INSERT INTO reservation_intervenant (reservation_id, user_id, horaire)
		VALUES ($1, $2, tstzrange($3, $4, '[)'))`, f.ReservationID, f.UserIDs[1], debut, debut.Add(2*time.Hour)); err != nil {
		t.Fatalf("insertion reservation_intervenant impossible : %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO reservation_salle (reservation_id, salle_id, horaire)
		VALUES ($1, $2, tstzrange($3, $4, '[)'))`, f.ReservationID, f.SalleID, debut, debut.Add(2*time.Hour)); err != nil {
		t.Fatalf("insertion reservation_salle impossible : %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO reservation_groupe (reservation_id, groupe_id, horaire)
		VALUES ($1, $2, tstzrange($3, $4, '[)'))`, f.ReservationID, f.GroupeID, debut, debut.Add(2*time.Hour)); err != nil {
		t.Fatalf("insertion reservation_groupe impossible : %v", err)
	}

	// R2 sur PE2, mais rattachée à la matière M1 (qui dépend de PE1) :
	// supprimer PE1 la détache (ON DELETE SET NULL) sans la supprimer.
	// Créneau disjoint de R1 pour ne pas violer les contraintes d'exclusion.
	f.ReservationR2 = exec(`INSERT INTO reservation (version, horaire, periode_id, matiere_id)
		VALUES (1, tstzrange($1, $2, '[)'), $3, $4) RETURNING id`,
		debut.Add(24*time.Hour), debut.Add(26*time.Hour), f.PeriodeAutre, f.MatiereID)

	return f
}

// SeedJuryResult insère un résultat de jury délibéré sur la période indiquée.
func SeedJuryResult(t *testing.T, pool *pgxpool.Pool, f StructureFixture) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO jury_result (user_id, periode_id, unite_enseignement_id, grade, gpa_index, ects)
		 VALUES ($1, $2, $3, 'A', 4, 4)`, f.UserIDs[0], f.PeriodeID, f.UeID)
	if err != nil {
		t.Fatalf("insertion jury_result impossible : %v", err)
	}
}

// NewBulkIDsRequest construit une requête HTTP dont le corps est {"ids": [...]}
// et dont le contexte porte le pool, comme le ferait DatabaseMiddleware.
func NewBulkIDsRequest(t *testing.T, pool *pgxpool.Pool, method, path string, ids []int32) *http.Request {
	t.Helper()
	body, err := json.Marshal(map[string][]int32{"ids": ids})
	if err != nil {
		t.Fatalf("sérialisation du corps impossible : %v", err)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req.WithContext(context.WithValue(req.Context(), PgCtxKey, &Postgres{Db: pool}))
}

// DecodeDeleteImpact décode le corps d'une réponse delete-impact.
func DecodeDeleteImpact(t *testing.T, rec *httptest.ResponseRecorder) DeleteImpactResponse {
	t.Helper()
	var resp DeleteImpactResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("réponse illisible (%s) : %v", rec.Body.String(), err)
	}
	return resp
}

// CascadeCounts aplatit la réponse en map entité -> décompte.
func CascadeCounts(resp DeleteImpactResponse) map[string]int64 {
	counts := make(map[string]int64, len(resp.Cascade))
	for _, entry := range resp.Cascade {
		counts[entry.Entity] = entry.Count
	}
	return counts
}

// AssertTablesVides vérifie qu'aucune ligne ne subsiste dans les tables données.
func AssertTablesVides(t *testing.T, pool *pgxpool.Pool, tables ...string) {
	t.Helper()
	for _, table := range tables {
		var n int
		if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM public."`+table+`"`).Scan(&n); err != nil {
			t.Fatalf("comptage de %s impossible : %v", table, err)
		}
		if n != 0 {
			t.Errorf("la table %s devrait être vide, %d ligne(s) restante(s)", table, n)
		}
	}
}
