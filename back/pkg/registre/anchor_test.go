package registre

// Tests de la garde d'ancrage. Aucune vraie TSA n'est contactée : l'endpoint
// est un httptest.Server local qui compte les requêtes reçues — c'est lui qui
// prouve que la garde d'idempotence coupe le trafic réseau.
//
// Provenance : rex-imt (backend/admin/pkg/presence/anchor_test.go), étendu de
// deux tests (garde d'idempotence, TSA en échec) sur le stub DBTX local.

import (
	"context"
	"cyb-react/pkg/services"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestDefaultTSAURL(t *testing.T) {
	if services.DefaultTSAURL == "" {
		t.Fatal("DefaultTSAURL must not be empty")
	}
}

// ── Stub DBTX dédié à l'ancrage ──────────────────────────────────────────────

// anchorRows simule pgx.Rows pour GetAncresByRegistreSeq : paires (id, tsa_url).
type anchorRows struct {
	ids  []int64
	urls []string
	idx  int
}

func (r *anchorRows) Next() bool                                   { r.idx++; return r.idx <= len(r.ids) }
func (r *anchorRows) Close()                                       {}
func (r *anchorRows) Err() error                                   { return nil }
func (r *anchorRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *anchorRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *anchorRows) Values() ([]any, error)                       { return nil, nil }
func (r *anchorRows) RawValues() [][]byte                          { return nil }
func (r *anchorRows) Conn() *pgx.Conn                              { return nil }
func (r *anchorRows) Scan(dest ...any) error {
	if r.idx < 1 || r.idx > len(r.ids) {
		return errors.New("out of range")
	}
	*(dest[0].(*int64)) = r.ids[r.idx-1]
	*(dest[1].(*string)) = r.urls[r.idx-1]
	return nil
}

// anchorDB répond aux trois requêtes d'AnchorLast : GetLastMaillon,
// GetAncresByRegistreSeq et InsertAncre. Il mémorise les insertions.
type anchorDB struct {
	headSeq      int64
	headHash     string
	existingIDs  []int64  // ancres déjà en base pour headSeq...
	existingURLs []string // ...et leurs TSA
	inserted     int
}

func (s *anchorDB) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("unexpected Exec: " + sql)
}

func (s *anchorDB) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if strings.Contains(sql, "FROM public.registre_ancre WHERE registre_seq") {
		return &anchorRows{ids: s.existingIDs, urls: s.existingURLs}, nil
	}
	return nil, errors.New("unexpected Query: " + sql)
}

func (s *anchorDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	switch {
	case strings.Contains(sql, "FROM public.registre ORDER BY seq DESC"):
		return &witnessRow{scan: func(dest ...any) error {
			*(dest[0].(*int64)) = s.headSeq
			*(dest[1].(*string)) = s.headHash
			return nil
		}}
	case strings.Contains(sql, "INSERT INTO public.registre_ancre"):
		s.inserted++
		return &witnessRow{scan: func(dest ...any) error {
			*(dest[0].(*int64)) = int64(100 + s.inserted)
			return nil
		}}
	}
	return &witnessRow{scan: func(...any) error { return errors.New("unexpected QueryRow: " + sql) }}
}

// ── Garde d'idempotence ──────────────────────────────────────────────────────

// TestAnchorLast_TeteInchangee : la tête de chaîne est déjà ancrée pour cette
// TSA → aucune nouvelle ancre, et surtout AUCUNE requête réseau vers la TSA.
// C'est la garde qui rend l'ordonnanceur horaire silencieux quand rien n'a
// bougé.
func TestAnchorLast_TeteInchangee(t *testing.T) {
	var hits atomic.Int64
	tsa := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
	}))
	defer tsa.Close()

	db := &anchorDB{
		headSeq:      42,
		headHash:     strings.Repeat("ab", 32),
		existingIDs:  []int64{7},
		existingURLs: []string{tsa.URL},
	}
	cfg := services.TimestampConfig{Enabled: true, URLs: []string{tsa.URL}}

	results, err := AnchorLast(context.Background(), db, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Created || results[0].AnchorID != 7 || results[0].Err != nil {
		t.Fatalf("attendu skip idempotent sur l'ancre 7, reçu %+v", results)
	}
	if db.inserted != 0 {
		t.Fatalf("aucune insertion attendue, reçu %d", db.inserted)
	}
	if hits.Load() != 0 {
		t.Fatalf("aucune requête TSA attendue, reçu %d", hits.Load())
	}
}

// TestAnchorLast_Disabled : ancrage désactivé → rien, ni base ni réseau.
func TestAnchorLast_Disabled(t *testing.T) {
	results, err := AnchorLast(context.Background(), &anchorDB{}, services.TimestampConfig{})
	if err != nil || results != nil {
		t.Fatalf("désactivé: attendu (nil, nil), reçu (%v, %v)", results, err)
	}
}

// TestAnchorLast_TSAEnEchec : la TSA répond 500 → l'échec est porté par le
// résultat (res.Err), rien n'est inséré, et AnchorLast ne retourne pas
// d'erreur globale — l'appelant (ordonnanceur, écran) logue et continue.
// L'écriture métier, elle, n'est jamais dans cette boucle : l'ancrage observe
// la chaîne, il ne la gouverne pas.
func TestAnchorLast_TSAEnEchec(t *testing.T) {
	tsa := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer tsa.Close()

	db := &anchorDB{headSeq: 42, headHash: strings.Repeat("ab", 32)}
	cfg := services.TimestampConfig{Enabled: true, URLs: []string{tsa.URL}}

	results, err := AnchorLast(context.Background(), db, cfg)
	if err != nil {
		t.Fatalf("un échec TSA ne doit pas être une erreur globale: %v", err)
	}
	if len(results) != 1 || results[0].Err == nil || results[0].Created {
		t.Fatalf("attendu un résultat en échec, reçu %+v", results)
	}
	if !strings.Contains(results[0].Err.Error(), "tsa http 500") {
		t.Errorf("motif d'échec inattendu: %v", results[0].Err)
	}
	if db.inserted != 0 {
		t.Fatalf("aucune insertion attendue sur échec TSA, reçu %d", db.inserted)
	}
}
