package registre

// Hash canonique des maillons du registre — adapté du package ledger de
// rex-imt. Deux familles de maillons partagent la même chaîne : les écritures
// de notes (note.*) et les écritures de jury (jury.*). Le champ op, en tête du
// format, discrimine la famille et sépare les domaines dans le hash.
//
// Conformité : le maillon ne porte jamais de texte libre ni de donnée
// nominative — identifiants, valeurs numériques, drapeaux, sub de l'auteur.
// La remarque d'une note n'entre que par son SHA-256 (HashRemarque). C'est
// aussi ce qui rend le séparateur « | » sûr : tous les champs texte du format
// sont des hex, des op fermés ou un sub UUID. Voir docs/rgpd-registre.md.

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

// GenesisHash is the conventional prev_hash of the first ledger entry.
// 64 zero digits make it visually recognisable as the chain origin.
const GenesisHash = "0000000000000000000000000000000000000000000000000000000000000000"

// Types d'opération. La liste peut s'étendre (une valeur d'op est une donnée,
// pas un élément du format) ; l'ordre et le nombre des champs, eux, sont gelés.
const (
	OpNoteCreate = "note.create" // création d'une note
	OpNoteUpdate = "note.update" // modification (valeur, drapeaux ou remarque)
	OpNoteDelete = "note.delete" // suppression demandée à l'écran Notes
	OpNotePurge  = "note.purge"  // destruction par purge de la corbeille
	OpNoteErase  = "note.erase"  // destruction par effacement RGPD (art. 17)

	OpJuryDeliberate = "jury.deliberate" // écriture d'un résultat délibéré (par UE)
	OpJuryCancel     = "jury.cancel"     // annulation d'une délibération (par UE)
	OpJuryErase      = "jury.erase"      // destruction par effacement RGPD (art. 17)
)

// NoteEntry carries the fields that enter the hash computation of a note
// maillon. The field order in ComputeNoteHash is contractual: changing it
// invalidates the entire chain.
type NoteEntry struct {
	Op           string
	NoteID       int32
	UserID       int32
	ControleID   int32
	OldNote      *float32 // absent à la création
	NewNote      *float32 // absent sur les destructions
	NotEvaluated bool
	IsValidated  bool
	RemarqueHash string // toujours renseigné : HashRemarque(nil) si absente
	AuthorSub    string
	EventAt      time.Time // must be UTC
	RecordedAt   time.Time // server-side recording timestamp, must be UTC
	PrevHash     string    // GenesisHash for the very first entry
}

// JuryEntry carries the fields that enter the hash computation of a jury
// maillon. Same contract as NoteEntry. Pour jury.cancel et jury.erase, les
// valeurs sont celles de la ligne détruite — le maillon reste autoportant.
type JuryEntry struct {
	Op                  string
	UserID              int32
	PeriodeID           int32
	UniteEnseignementID int32
	Grade               *string
	GpaIndex            *int32
	Ects                *float32
	CompteCumul         bool
	AuthorSub           string
	EventAt             time.Time
	RecordedAt          time.Time
	PrevHash            string
}

// ComputeNoteHash returns the hex-encoded SHA-256 of the canonical
// serialisation of e.
//
// Canonical format (pipe-separated, field order is contractual):
//
//	op|note_id|user_id|controle_id|old_note|new_note|not_evaluated|is_validated|remarque_hash|author_sub|event_at|recorded_at|prev_hash
//
// Un champ optionnel absent se sérialise en chaîne vide — distincte de "0".
// Timestamps are truncated to MICROSECOND precision, then formatted as
// RFC3339Nano in UTC. The truncation is contractual: timestamptz stores
// microseconds, so hashing anything finer (time.Now() carries nanoseconds)
// would make the hash impossible to reproduce after a database round-trip and
// break chain verification.
func ComputeNoteHash(e NoteEntry) string {
	canonical := fmt.Sprintf("%s|%d|%d|%d|%s|%s|%s|%s|%s|%s|%s|%s|%s",
		e.Op,
		e.NoteID,
		e.UserID,
		e.ControleID,
		canonF32(e.OldNote),
		canonF32(e.NewNote),
		strconv.FormatBool(e.NotEvaluated),
		strconv.FormatBool(e.IsValidated),
		e.RemarqueHash,
		e.AuthorSub,
		canonTime(e.EventAt),
		canonTime(e.RecordedAt),
		e.PrevHash,
	)
	sum := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(sum[:])
}

// ComputeJuryHash returns the hex-encoded SHA-256 of the canonical
// serialisation of e.
//
// Canonical format (pipe-separated, field order is contractual):
//
//	op|user_id|periode_id|unite_enseignement_id|grade|gpa_index|ects|compte_cumul|author_sub|event_at|recorded_at|prev_hash
func ComputeJuryHash(e JuryEntry) string {
	canonical := fmt.Sprintf("%s|%d|%d|%d|%s|%s|%s|%s|%s|%s|%s|%s",
		e.Op,
		e.UserID,
		e.PeriodeID,
		e.UniteEnseignementID,
		canonStr(e.Grade),
		canonI32(e.GpaIndex),
		canonF32(e.Ects),
		strconv.FormatBool(e.CompteCumul),
		e.AuthorSub,
		canonTime(e.EventAt),
		canonTime(e.RecordedAt),
		e.PrevHash,
	)
	sum := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(sum[:])
}

// HashRemarque hache le texte libre d'une remarque pour le maillon : SHA-256
// hex du texte, SHA-256 de la chaîne vide si absente. Le texte lui-même ne
// figure jamais dans le registre (minimisation, art. 5.1.c — la remarque peut
// receler des données de santé).
func HashRemarque(remarque *string) string {
	texte := ""
	if remarque != nil {
		texte = *remarque
	}
	sum := sha256.Sum256([]byte(texte))
	return hex.EncodeToString(sum[:])
}

// canonF32 sérialise un réel nullable : chaîne vide si absent, sinon la forme
// 'g' la plus courte qui restitue exactement le float32 — l'aller-retour
// float32 ↔ real PostgreSQL est exact, la sérialisation est donc reproductible
// après relecture.
func canonF32(v *float32) string {
	if v == nil {
		return ""
	}
	return strconv.FormatFloat(float64(*v), 'g', -1, 32)
}

func canonI32(v *int32) string {
	if v == nil {
		return ""
	}
	return strconv.FormatInt(int64(*v), 10)
}

func canonStr(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func canonTime(t time.Time) string {
	return t.UTC().Truncate(time.Microsecond).Format(time.RFC3339Nano)
}
