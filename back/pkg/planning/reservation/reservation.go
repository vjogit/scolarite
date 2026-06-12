package reservation

import (
	"cyb-react/pkg/planning/reservation/gen"
	"cyb-react/pkg/services"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// Définition des contraintes spécifiques au domaine "Reservation"
var reservationConstraints = map[string]services.ConstraintRule{
	"sans_conflit_salle":       {Field: "salles", Message: "Une ou plusieurs salles sont déjà réservées sur ce créneau"},
	"sans_conflit_intervenant": {Field: "intervenants", Message: "Un ou plusieurs intervenants sont déjà occupés sur ce créneau"},
	"sans_conflit_groupe":      {Field: "groupes", Message: "Un ou plusieurs groupes sont déjà planifiés sur ce créneau"},
}

func CreateReservation(w http.ResponseWriter, r *http.Request) {
	var input ReservationInput
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	ctx := r.Context()
	pgCtx := services.GetPgCtx(ctx)

	// Ouverture de la transaction
	tx, err := pgCtx.Db.Begin(ctx)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	defer tx.Rollback(ctx) // no-op si Commit() a déjà été appelé

	// doit completer les bornes
	input.Horaire.LowerType = pgtype.Inclusive
	input.Horaire.UpperType = pgtype.Inclusive
	input.Horaire.Valid = true

	queries := gen.New(tx)

	id, err := queries.CreateReservation(ctx, gen.CreateReservationParams{
		Horaire:      input.Horaire,
		PeriodeID:    input.PeriodeID,
		MatiereID:    input.MatiereID,
		TypeCours:    input.TypeCours,
		IsDistanciel: input.IsDistanciel,
		Description:  input.Description,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, reservationConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	if err := addAssociations(w, r, queries, id, input.Horaire, input); err != nil {
		return
	}

	// Tout s'est bien passé : on valide
	if err := tx.Commit(ctx); err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Réservation créée", "id", id)

	// Lecture hors transaction pour le retour (données propres post-commit)
	finalQueries := getQueriesFromCtx(r)
	row, err := finalQueries.FetchReservationByID(ctx, id)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	detail, err := ParseReservationDetail(row)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	render.Status(r, http.StatusCreated)
	render.JSON(w, r, detail)
}

func FetchReservation(w http.ResponseWriter, r *http.Request) {
	row := getReservationFromCtx(r)
	if row == nil {
		return
	}

	detail, err := ParseReservationDetail(*row)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	render.JSON(w, r, detail)
}

func FetchReservationsByPeriode(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)
	periodeID := getPeriodeIDFromCtx(r)

	rows, err := queries.FetchReservationsByPeriode(r.Context(), periodeID)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	details := make([]ReservationDetail, 0, len(rows))
	for _, row := range rows {
		detail, err := ParseReservationDetail(gen.FetchReservationByIDRow(row))
		if err != nil {
			services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
			return
		}
		details = append(details, detail)
	}

	render.JSON(w, r, details)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input ReservationInput
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	ctx := r.Context()
	pgCtx := services.GetPgCtx(ctx)

	// Ouverture de la transaction
	tx, err := pgCtx.Db.Begin(ctx)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	defer tx.Rollback(ctx) // no-op si Commit() a déjà été appelé

	queries := gen.New(tx)

	// doit completer les bornes
	input.Horaire.LowerType = pgtype.Inclusive
	input.Horaire.UpperType = pgtype.Inclusive
	input.Horaire.Valid = true

	version, err := queries.UpdateReservation(ctx, gen.UpdateReservationParams{
		ID:           input.ID,
		Version:      input.Version,
		Horaire:      input.Horaire,
		PeriodeID:    input.PeriodeID,
		MatiereID:    input.MatiereID,
		TypeCours:    input.TypeCours,
		IsDistanciel: input.IsDistanciel,
		Description:  input.Description,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, reservationConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// Remplacement complet des associations dans la même transaction
	if err := queries.DeleteReservationSalles(ctx, input.ID); err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if err := queries.DeleteReservationIntervenants(ctx, input.ID); err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if err := queries.DeleteReservationGroupes(ctx, input.ID); err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	if err := addAssociations(w, r, queries, input.ID, input.Horaire, input); err != nil {
		return
	}

	// Tout s'est bien passé : on valide
	if err := tx.Commit(ctx); err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Réservation mise à jour", "id", input.ID)

	// Lecture hors transaction pour le retour (données propres post-commit)
	finalQueries := getQueriesFromCtx(r)
	row, err := finalQueries.FetchReservationByID(ctx, input.ID)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	detail, err := ParseReservationDetail(row)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	detail.Version = version
	render.JSON(w, r, detail)
}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func Delete(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Les associations sont supprimées automatiquement par CASCADE
	if err := queries.DeleteReservation(r.Context(), input.IDs); err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Suppression des réservations", "ids", input.IDs)
	w.WriteHeader(http.StatusNoContent)
}

// ── Helpers privés ───────────────────────────────────────────────────────────

// addAssociations insère les salles, intervenants et groupes pour une réservation.
// Les queries passées en paramètre doivent déjà être dans une transaction.
// Retourne une erreur (déjà écrite dans w) si une insertion échoue.
func addAssociations(w http.ResponseWriter, r *http.Request, queries *gen.Queries, reservationID int32, horaire pgtype.Range[pgtype.Timestamptz], input ReservationInput) error {
	ctx := r.Context()

	for _, salleID := range input.SalleIDs {
		if err := queries.AddReservationSalle(ctx, gen.AddReservationSalleParams{
			ReservationID: reservationID,
			SalleID:       salleID,
			Horaire:       horaire,
		}); err != nil {
			errorsMap := services.MapPgErrorToValidationErrors(err, reservationConstraints)
			if len(errorsMap) > 0 {
				services.InvalidRequestError(w, r, "conflit de salle", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
				return err
			}
			services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
			return err
		}
	}

	for _, userID := range input.IntervenantIDs {
		if err := queries.AddReservationIntervenant(ctx, gen.AddReservationIntervenantParams{
			ReservationID: reservationID,
			UserID:        userID,
			Horaire:       horaire,
		}); err != nil {
			errorsMap := services.MapPgErrorToValidationErrors(err, reservationConstraints)
			if len(errorsMap) > 0 {
				services.InvalidRequestError(w, r, "conflit d'intervenant", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
				return err
			}
			services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
			return err
		}
	}

	for _, groupeID := range input.GroupeIDs {
		if err := queries.AddReservationGroupe(ctx, gen.AddReservationGroupeParams{
			ReservationID: reservationID,
			GroupeID:      groupeID,
			Horaire:       horaire,
		}); err != nil {
			errorsMap := services.MapPgErrorToValidationErrors(err, reservationConstraints)
			if len(errorsMap) > 0 {
				services.InvalidRequestError(w, r, "conflit de groupe", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
				return err
			}
			services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
			return err
		}
	}

	return nil
}
