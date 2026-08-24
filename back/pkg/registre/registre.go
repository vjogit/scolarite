package registre

// Accès au registre chaîné — UNIQUE implémentation du chaînage, appelée par
// les handlers de note, l'import de fiche, la délibération de jury, la purge
// de la corbeille et l'effacement d'utilisateurs. Le hash canonique est dans
// hash.go ; les requêtes SQL sont générées par sqlc dans pkg/registre/gen.
//
// Toute écriture exige une transaction déjà ouverte : le maillon et la donnée
// qu'il trace se valident ou s'annulent ensemble, et le verrou consultatif qui
// sérialise la chaîne est de niveau transaction.

import (
	"context"
	"cyb-react/pkg/registre/gen"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// DBTX est l'abstraction d'accès DB des fonctions de lecture du registre,
// satisfaite par *pgxpool.Pool comme par pgx.Tx.
type DBTX = gen.DBTX

// registreAdvisoryKey is the PostgreSQL advisory lock key used to serialise
// all registre writes. Any value is valid as long as it is stable and unique
// within the application. Using a transaction-level lock
// (pg_advisory_xact_lock) means it is released automatically on commit or
// rollback.
const registreAdvisoryKey = 9_002_001

// AppendNote ajoute un maillon de note au registre dans tx.
// tx MUST already be open; commit/rollback is the caller's responsibility.
// e.RecordedAt et e.PrevHash sont posés ici, jamais par l'appelant.
func AppendNote(ctx context.Context, tx pgx.Tx, e NoteEntry) (seq int64, h string, err error) {
	q := gen.New(tx)

	prevHash, err := lockAndGetPrev(ctx, q)
	if err != nil {
		return 0, "", err
	}

	// Troncature à la microseconde AVANT l'insertion : la valeur envoyée est
	// déjà exactement représentable en timestamptz, sans dépendre du driver
	// (pgx tronque en binaire, mais le protocole texte arrondirait — ce qui
	// casserait la re-vérification).
	e.EventAt = e.EventAt.UTC().Truncate(time.Microsecond)
	e.RecordedAt = time.Now().UTC().Truncate(time.Microsecond)
	e.PrevHash = prevHash
	h = ComputeNoteHash(e)

	seq, err = q.InsertMaillon(ctx, gen.InsertMaillonParams{
		Op:           e.Op,
		UserID:       e.UserID,
		NoteID:       &e.NoteID,
		ControleID:   &e.ControleID,
		OldNote:      e.OldNote,
		NewNote:      e.NewNote,
		NotEvaluated: &e.NotEvaluated,
		IsValidated:  &e.IsValidated,
		RemarqueHash: &e.RemarqueHash,
		AuthorSub:    e.AuthorSub,
		EventAt:      pgtype.Timestamptz{Time: e.EventAt, Valid: true},
		RecordedAt:   pgtype.Timestamptz{Time: e.RecordedAt, Valid: true},
		PrevHash:     e.PrevHash,
		Hash:         h,
	})
	if err != nil {
		return 0, "", fmt.Errorf("registre insert note: %w", err)
	}
	return seq, h, nil
}

// AppendJury ajoute un maillon de jury au registre dans tx.
// Mêmes contrats qu'AppendNote.
func AppendJury(ctx context.Context, tx pgx.Tx, e JuryEntry) (seq int64, h string, err error) {
	q := gen.New(tx)

	prevHash, err := lockAndGetPrev(ctx, q)
	if err != nil {
		return 0, "", err
	}

	e.EventAt = e.EventAt.UTC().Truncate(time.Microsecond)
	e.RecordedAt = time.Now().UTC().Truncate(time.Microsecond)
	e.PrevHash = prevHash
	h = ComputeJuryHash(e)

	seq, err = q.InsertMaillon(ctx, gen.InsertMaillonParams{
		Op:                  e.Op,
		UserID:              e.UserID,
		PeriodeID:           &e.PeriodeID,
		UniteEnseignementID: &e.UniteEnseignementID,
		Grade:               e.Grade,
		GpaIndex:            e.GpaIndex,
		Ects:                e.Ects,
		CompteCumul:         &e.CompteCumul,
		AuthorSub:           e.AuthorSub,
		EventAt:             pgtype.Timestamptz{Time: e.EventAt, Valid: true},
		RecordedAt:          pgtype.Timestamptz{Time: e.RecordedAt, Valid: true},
		PrevHash:            e.PrevHash,
		Hash:                h,
	})
	if err != nil {
		return 0, "", fmt.Errorf("registre insert jury: %w", err)
	}
	return seq, h, nil
}

// lockAndGetPrev sérialise les écrivains concurrents puis lit le hash du
// dernier maillon (sentinelle genesis si le registre est vide).
func lockAndGetPrev(ctx context.Context, q *gen.Queries) (string, error) {
	if err := q.AcquireRegistreLock(ctx, registreAdvisoryKey); err != nil {
		return "", fmt.Errorf("registre advisory lock: %w", err)
	}
	last, err := q.GetLastMaillon(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return GenesisHash, nil
	}
	if err != nil {
		return "", fmt.Errorf("registre get last hash: %w", err)
	}
	return last.Hash, nil
}

// noteRow est la forme commune des lignes de note lues avant destruction —
// les trois requêtes (Ids/Users/Purge) rendent les mêmes colonnes.
type noteRow struct {
	ID           int32
	Note         *float32
	Remarque     *string
	UserID       int32
	ControleID   int32
	IsValidated  bool
	NotEvaluated bool
}

// appendNotesDetruites écrit un maillon par note détruite : l'ancienne valeur
// et l'état des drapeaux au moment de la destruction, pas de nouvelle valeur.
func appendNotesDetruites(ctx context.Context, tx pgx.Tx, op string, notes []noteRow, authorSub string, eventAt time.Time) error {
	for _, n := range notes {
		if _, _, err := AppendNote(ctx, tx, NoteEntry{
			Op:           op,
			NoteID:       n.ID,
			UserID:       n.UserID,
			ControleID:   n.ControleID,
			OldNote:      n.Note,
			NotEvaluated: n.NotEvaluated,
			IsValidated:  n.IsValidated,
			RemarqueHash: HashRemarque(n.Remarque),
			AuthorSub:    authorSub,
			EventAt:      eventAt,
		}); err != nil {
			return err
		}
	}
	return nil
}

// TracerSuppressionNotes écrit un maillon note.delete par note visée, l'état
// étant lu avant le DELETE — à appeler dans la transaction qui supprime.
func TracerSuppressionNotes(ctx context.Context, tx pgx.Tx, ids []int32, authorSub string) (int, error) {
	rows, err := gen.New(tx).ListNotesByIds(ctx, ids)
	if err != nil {
		return 0, fmt.Errorf("registre: lecture des notes à supprimer: %w", err)
	}
	notes := make([]noteRow, len(rows))
	for i, r := range rows {
		notes[i] = noteRow(r)
	}
	return len(notes), appendNotesDetruites(ctx, tx, OpNoteDelete, notes, authorSub, time.Now())
}

// TracerPurgeNotes écrit un maillon note.purge par note que la purge d'une
// opération de corbeille va détruire par cascade — à appeler dans la
// transaction de purge, avant les DELETE des racines.
func TracerPurgeNotes(ctx context.Context, tx pgx.Tx, racineType string, rootIDs []int32, authorSub string) (int, error) {
	rows, err := gen.New(tx).ListNotesToPurge(ctx, gen.ListNotesToPurgeParams{
		RacineType: racineType,
		Ids:        rootIDs,
	})
	if err != nil {
		return 0, fmt.Errorf("registre: lecture des notes à purger: %w", err)
	}
	notes := make([]noteRow, len(rows))
	for i, r := range rows {
		notes[i] = noteRow(r)
	}
	return len(notes), appendNotesDetruites(ctx, tx, OpNotePurge, notes, authorSub, time.Now())
}

// TracerEffacementUtilisateurs écrit les maillons note.erase et jury.erase
// pour tout ce que la destruction des lignes user emportera par cascade — à
// appeler dans la transaction qui supprime les utilisateurs.
func TracerEffacementUtilisateurs(ctx context.Context, tx pgx.Tx, userIDs []int32, authorSub string) (int, error) {
	q := gen.New(tx)
	eventAt := time.Now()

	noteRows, err := q.ListNotesByUsers(ctx, userIDs)
	if err != nil {
		return 0, fmt.Errorf("registre: lecture des notes à effacer: %w", err)
	}
	notes := make([]noteRow, len(noteRows))
	for i, r := range noteRows {
		notes[i] = noteRow(r)
	}
	if err := appendNotesDetruites(ctx, tx, OpNoteErase, notes, authorSub, eventAt); err != nil {
		return 0, err
	}

	juryRows, err := q.ListJuryResultsByUsers(ctx, userIDs)
	if err != nil {
		return 0, fmt.Errorf("registre: lecture des résultats de jury à effacer: %w", err)
	}
	for _, jr := range juryRows {
		if _, _, err := AppendJury(ctx, tx, JuryEntry{
			Op:                  OpJuryErase,
			UserID:              jr.UserID,
			PeriodeID:           jr.PeriodeID,
			UniteEnseignementID: jr.UniteEnseignementID,
			Grade:               jr.Grade,
			GpaIndex:            jr.GpaIndex,
			Ects:                jr.Ects,
			CompteCumul:         jr.CompteCumul,
			AuthorSub:           authorSub,
			EventAt:             eventAt,
		}); err != nil {
			return 0, err
		}
	}
	return len(notes) + len(juryRows), nil
}

// TracerAnnulationJury écrit un maillon jury.cancel par résultat que
// l'annulation d'une délibération va détruire, valeurs détruites comprises —
// à appeler dans la transaction, avant le DELETE.
func TracerAnnulationJury(ctx context.Context, tx pgx.Tx, userID, periodeID int32, authorSub string) (int, error) {
	rows, err := gen.New(tx).ListJuryResultsByUserPeriode(ctx, gen.ListJuryResultsByUserPeriodeParams{
		UserID:    userID,
		PeriodeID: periodeID,
	})
	if err != nil {
		return 0, fmt.Errorf("registre: lecture des résultats de jury à annuler: %w", err)
	}
	eventAt := time.Now()
	for _, jr := range rows {
		if _, _, err := AppendJury(ctx, tx, JuryEntry{
			Op:                  OpJuryCancel,
			UserID:              jr.UserID,
			PeriodeID:           jr.PeriodeID,
			UniteEnseignementID: jr.UniteEnseignementID,
			Grade:               jr.Grade,
			GpaIndex:            jr.GpaIndex,
			Ects:                jr.Ects,
			CompteCumul:         jr.CompteCumul,
			AuthorSub:           authorSub,
			EventAt:             eventAt,
		}); err != nil {
			return 0, err
		}
	}
	return len(rows), nil
}

// VerifyChainResult is the result of a chain verification.
type VerifyChainResult struct {
	OK       bool   `json:"ok"`
	Maillons int64  `json:"maillons"`
	BrokenAt int64  `json:"broken_at,omitempty"` // seq of the first broken entry; 0 when OK
	Error    string `json:"error,omitempty"`     // human-readable description when not OK
}

// VerifierChaine reads every entry in registre ordered by seq and recomputes
// each hash, verifying that:
//  1. le hash recalculé du maillon égale le hash stocké ;
//  2. prev_hash égale le hash du maillon précédent (GenesisHash pour le premier).
//
// Returns OK=true when the chain is intact. On the first broken link it
// returns OK=false and BrokenAt set to the seq of the faulty entry.
func VerifierChaine(ctx context.Context, db DBTX) (VerifyChainResult, error) {
	rows, err := gen.New(db).ListMaillonsBySeq(ctx)
	if err != nil {
		return VerifyChainResult{}, fmt.Errorf("registre query: %w", err)
	}

	prevHash := GenesisHash // hash of the previous row, genesis for the first

	for _, row := range rows {
		if row.PrevHash != prevHash {
			return VerifyChainResult{
				Maillons: int64(len(rows)),
				BrokenAt: row.Seq,
				Error:    fmt.Sprintf("seq %d: prev_hash mismatch (got %s, want %s)", row.Seq, row.PrevHash, prevHash),
			}, nil
		}

		computed, err := recomputeRow(row)
		if err != nil {
			return VerifyChainResult{
				Maillons: int64(len(rows)),
				BrokenAt: row.Seq,
				Error:    fmt.Sprintf("seq %d: %v", row.Seq, err),
			}, nil
		}
		if computed != row.Hash {
			return VerifyChainResult{
				Maillons: int64(len(rows)),
				BrokenAt: row.Seq,
				Error:    fmt.Sprintf("seq %d: hash mismatch (stored %s, computed %s)", row.Seq, row.Hash, computed),
			}, nil
		}

		prevHash = row.Hash
	}
	return VerifyChainResult{OK: true, Maillons: int64(len(rows))}, nil
}

// recomputeRow reconstruit l'entrée canonique d'une ligne selon sa famille et
// recalcule son hash. Une colonne obligatoire absente vaut altération : la
// ligne ne peut pas provenir d'AppendNote/AppendJury.
func recomputeRow(row gen.Registre) (string, error) {
	switch {
	case row.NoteID != nil:
		if row.ControleID == nil || row.NotEvaluated == nil || row.IsValidated == nil || row.RemarqueHash == nil {
			return "", fmt.Errorf("maillon note incomplet (op %s)", row.Op)
		}
		return ComputeNoteHash(NoteEntry{
			Op:           row.Op,
			NoteID:       *row.NoteID,
			UserID:       row.UserID,
			ControleID:   *row.ControleID,
			OldNote:      row.OldNote,
			NewNote:      row.NewNote,
			NotEvaluated: *row.NotEvaluated,
			IsValidated:  *row.IsValidated,
			RemarqueHash: *row.RemarqueHash,
			AuthorSub:    row.AuthorSub,
			EventAt:      row.EventAt.Time,
			RecordedAt:   row.RecordedAt.Time,
			PrevHash:     row.PrevHash,
		}), nil
	case row.PeriodeID != nil:
		if row.UniteEnseignementID == nil || row.CompteCumul == nil {
			return "", fmt.Errorf("maillon jury incomplet (op %s)", row.Op)
		}
		return ComputeJuryHash(JuryEntry{
			Op:                  row.Op,
			UserID:              row.UserID,
			PeriodeID:           *row.PeriodeID,
			UniteEnseignementID: *row.UniteEnseignementID,
			Grade:               row.Grade,
			GpaIndex:            row.GpaIndex,
			Ects:                row.Ects,
			CompteCumul:         *row.CompteCumul,
			AuthorSub:           row.AuthorSub,
			EventAt:             row.EventAt.Time,
			RecordedAt:          row.RecordedAt.Time,
			PrevHash:            row.PrevHash,
		}), nil
	default:
		return "", fmt.Errorf("maillon sans famille (op %s)", row.Op)
	}
}
