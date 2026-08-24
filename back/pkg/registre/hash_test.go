package registre_test

import (
	"crypto/sha256"
	"cyb-react/pkg/registre"
	"encoding/hex"
	"testing"
	"time"
)

func f32(v float32) *float32 { return &v }
func i32(v int32) *int32     { return &v }
func str(v string) *string   { return &v }

var baseNote = registre.NoteEntry{
	Op:           registre.OpNoteUpdate,
	NoteID:       42,
	UserID:       7,
	ControleID:   3,
	OldNote:      f32(12),
	NewNote:      f32(15.5),
	NotEvaluated: false,
	IsValidated:  true,
	RemarqueHash: registre.HashRemarque(nil),
	AuthorSub:    "kc-agent-1",
	EventAt:      time.Date(2026, 6, 29, 14, 30, 0, 123456789, time.UTC),
	RecordedAt:   time.Date(2026, 6, 29, 14, 30, 0, 987654321, time.UTC),
	PrevHash:     registre.GenesisHash,
}

var baseJury = registre.JuryEntry{
	Op:                  registre.OpJuryDeliberate,
	UserID:              7,
	PeriodeID:           2,
	UniteEnseignementID: 5,
	Grade:               str("A"),
	GpaIndex:            i32(1),
	Ects:                f32(4),
	CompteCumul:         true,
	AuthorSub:           "kc-agent-1",
	EventAt:             time.Date(2026, 6, 29, 14, 30, 0, 123456789, time.UTC),
	RecordedAt:          time.Date(2026, 6, 29, 14, 30, 0, 987654321, time.UTC),
	PrevHash:            registre.GenesisHash,
}

func TestComputeNoteHash_Determinism(t *testing.T) {
	h1 := registre.ComputeNoteHash(baseNote)
	h2 := registre.ComputeNoteHash(baseNote)
	if h1 != h2 {
		t.Fatalf("non-deterministic: %q != %q", h1, h2)
	}
	if len(h1) != 64 {
		t.Fatalf("hash length %d, want 64", len(h1))
	}
}

// Chaque champ du format canonique doit peser dans le hash : un champ muet
// serait un champ falsifiable sans détection.
func TestComputeNoteHash_Sensitivity(t *testing.T) {
	ref := registre.ComputeNoteHash(baseNote)

	mut := func(f func(e *registre.NoteEntry)) registre.NoteEntry {
		e := baseNote
		f(&e)
		return e
	}

	cases := []struct {
		name  string
		entry registre.NoteEntry
	}{
		{"Op", mut(func(e *registre.NoteEntry) { e.Op = registre.OpNoteCreate })},
		{"NoteID", mut(func(e *registre.NoteEntry) { e.NoteID = 43 })},
		{"UserID", mut(func(e *registre.NoteEntry) { e.UserID = 8 })},
		{"ControleID", mut(func(e *registre.NoteEntry) { e.ControleID = 4 })},
		{"OldNote", mut(func(e *registre.NoteEntry) { e.OldNote = f32(13) })},
		{"NewNote", mut(func(e *registre.NoteEntry) { e.NewNote = f32(15.75) })},
		{"NotEvaluated", mut(func(e *registre.NoteEntry) { e.NotEvaluated = true })},
		{"IsValidated", mut(func(e *registre.NoteEntry) { e.IsValidated = false })},
		{"RemarqueHash", mut(func(e *registre.NoteEntry) { e.RemarqueHash = registre.HashRemarque(str("absente")) })},
		{"AuthorSub", mut(func(e *registre.NoteEntry) { e.AuthorSub = "kc-agent-2" })},
		{"EventAt", mut(func(e *registre.NoteEntry) { e.EventAt = e.EventAt.Add(time.Microsecond) })},
		{"RecordedAt", mut(func(e *registre.NoteEntry) { e.RecordedAt = e.RecordedAt.Add(time.Microsecond) })},
		{"PrevHash", mut(func(e *registre.NoteEntry) {
			e.PrevHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
		})},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if registre.ComputeNoteHash(tc.entry) == ref {
				t.Errorf("hash unchanged after mutation %q", tc.name)
			}
		})
	}
}

func TestComputeJuryHash_Sensitivity(t *testing.T) {
	ref := registre.ComputeJuryHash(baseJury)

	mut := func(f func(e *registre.JuryEntry)) registre.JuryEntry {
		e := baseJury
		f(&e)
		return e
	}

	cases := []struct {
		name  string
		entry registre.JuryEntry
	}{
		{"Op", mut(func(e *registre.JuryEntry) { e.Op = registre.OpJuryCancel })},
		{"UserID", mut(func(e *registre.JuryEntry) { e.UserID = 8 })},
		{"PeriodeID", mut(func(e *registre.JuryEntry) { e.PeriodeID = 3 })},
		{"UniteEnseignementID", mut(func(e *registre.JuryEntry) { e.UniteEnseignementID = 6 })},
		{"Grade", mut(func(e *registre.JuryEntry) { e.Grade = str("B") })},
		{"GpaIndex", mut(func(e *registre.JuryEntry) { e.GpaIndex = i32(2) })},
		{"Ects", mut(func(e *registre.JuryEntry) { e.Ects = f32(6) })},
		{"CompteCumul", mut(func(e *registre.JuryEntry) { e.CompteCumul = false })},
		{"AuthorSub", mut(func(e *registre.JuryEntry) { e.AuthorSub = "kc-agent-2" })},
		{"EventAt", mut(func(e *registre.JuryEntry) { e.EventAt = e.EventAt.Add(time.Microsecond) })},
		{"RecordedAt", mut(func(e *registre.JuryEntry) { e.RecordedAt = e.RecordedAt.Add(time.Microsecond) })},
		{"PrevHash", mut(func(e *registre.JuryEntry) {
			e.PrevHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
		})},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if registre.ComputeJuryHash(tc.entry) == ref {
				t.Errorf("hash unchanged after mutation %q", tc.name)
			}
		})
	}
}

// Un champ optionnel absent (chaîne vide) et un champ à zéro sont deux états
// distincts : « pas de note » n'est pas « zéro sur vingt ».
func TestComputeNoteHash_NilDistinctDeZero(t *testing.T) {
	avecNil := baseNote
	avecNil.OldNote = nil
	avecZero := baseNote
	avecZero.OldNote = f32(0)
	if registre.ComputeNoteHash(avecNil) == registre.ComputeNoteHash(avecZero) {
		t.Fatal("OldNote nil et OldNote 0 doivent produire des hash distincts")
	}
}

// Verrouille le contrat de précision : le hash calculé à l'insertion
// (time.Now() nanoseconde) doit être reproductible après relecture depuis
// PostgreSQL, qui tronque timestamptz à la microseconde. Sans troncature dans
// ComputeNoteHash, toute vérification de chaîne échouerait au premier maillon.
func TestComputeNoteHash_DatabaseRoundTrip(t *testing.T) {
	atInsert := baseNote // EventAt/RecordedAt portent des nanosecondes (…789, …321)

	afterRoundTrip := baseNote
	afterRoundTrip.EventAt = baseNote.EventAt.Truncate(time.Microsecond)
	afterRoundTrip.RecordedAt = baseNote.RecordedAt.Truncate(time.Microsecond)

	if h1, h2 := registre.ComputeNoteHash(atInsert), registre.ComputeNoteHash(afterRoundTrip); h1 != h2 {
		t.Fatalf("hash not reproducible after microsecond round-trip: %q != %q", h1, h2)
	}
}

// Le linkage : altérer un maillon change son hash, donc invalide le prev_hash
// de son successeur — c'est la propriété qui rend la chaîne vérifiable.
func TestComputeHash_ChainLinkage(t *testing.T) {
	h1 := registre.ComputeNoteHash(baseNote)

	e2 := baseJury
	e2.PrevHash = h1
	h2 := registre.ComputeJuryHash(e2)

	e2tampered := e2
	e2tampered.PrevHash = registre.ComputeNoteHash(TamperNote(baseNote))
	if registre.ComputeJuryHash(e2tampered) == h2 {
		t.Fatal("changing prev_hash must change the current hash")
	}
}

func TamperNote(e registre.NoteEntry) registre.NoteEntry {
	e.NewNote = f32(20)
	return e
}

func TestHashRemarque(t *testing.T) {
	vide := sha256.Sum256([]byte(""))
	if registre.HashRemarque(nil) != hex.EncodeToString(vide[:]) {
		t.Fatal("HashRemarque(nil) doit être le SHA-256 de la chaîne vide")
	}
	if registre.HashRemarque(str("")) != registre.HashRemarque(nil) {
		t.Fatal("remarque vide et remarque absente doivent se hacher pareil")
	}
	if registre.HashRemarque(str("absente — hospitalisation")) == registre.HashRemarque(nil) {
		t.Fatal("une remarque non vide doit changer le hash")
	}
}

func TestGenesisIsRecognisable(t *testing.T) {
	if len(registre.GenesisHash) != 64 {
		t.Fatalf("GenesisHash length %d, want 64", len(registre.GenesisHash))
	}
	for _, c := range registre.GenesisHash {
		if c != '0' {
			t.Fatalf("GenesisHash contains non-zero character: %q", registre.GenesisHash)
		}
	}
}
