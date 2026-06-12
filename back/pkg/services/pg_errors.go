package services

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// ConstraintRule définit la correspondance entre une contrainte SQL et un champ de l'API
type ConstraintRule struct {
	Field   string
	Message string
}

// ConstraintError est la valeur retournée dans la map d'erreurs de validation.
// Detail est renseigné pour les violations d'exclusion (23P01) afin de permettre
// au frontend d'afficher le créneau conflictuel précis.
type ConstraintError struct {
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

// MapPgErrorToValidationErrors analyse une erreur PostgreSQL et retourne une map d'erreurs de validation
// en se basant sur les règles de contraintes fournies.
func MapPgErrorToValidationErrors(err error, constraints map[string]ConstraintRule) map[string]ConstraintError {
	errorsMap := make(map[string]ConstraintError)

	var pgErr *pgconn.PgError

	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23514": // Check constraint violation
			if rule, ok := constraints[pgErr.ConstraintName]; ok {
				errorsMap[rule.Field] = ConstraintError{Message: rule.Message}
			}
		case "23502": // NOT NULL violation
			errorsMap[pgErr.ColumnName] = ConstraintError{Message: "Ce champ est obligatoire"}
		case "23505": // UNIQUE violation
			if rule, ok := constraints[pgErr.ConstraintName]; ok {
				errorsMap[rule.Field] = ConstraintError{Message: rule.Message}
			}
		case "23503": // Foreign key violation
			if rule, ok := constraints[pgErr.ConstraintName]; ok {
				errorsMap[rule.Field] = ConstraintError{Message: rule.Message}
			}
		case "23P01": // Exclusion constraint violation
			if rule, ok := constraints[pgErr.ConstraintName]; ok {
				errorsMap[rule.Field] = ConstraintError{Message: rule.Message, Detail: pgErr.Detail}
			}
		}
	}

	return errorsMap
}
