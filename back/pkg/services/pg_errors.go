package services

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// Motifs d'erreur de champ et de ligne d'import. Le serveur émet des codes,
// errorMessages.ts possède les mots : chaque valeur ici a son entrée là-bas.
// snake_case, comme les valeurs de `reason` déjà en circulation.
const (
	// Champs de formulaire (contraintes SQL et validations serveur)
	MotifChampObligatoire    = "champ_obligatoire"
	MotifValeurDejaUtilisee  = "valeur_deja_utilisee"
	MotifReferenceInconnue   = "reference_inconnue"
	MotifValeurNegative      = "valeur_negative"
	MotifNoteHorsBareme      = "note_hors_bareme"
	MotifNoteMaxAbsolu       = "note_max_absolu"
	MotifFinAvantDebut       = "fin_avant_debut"
	MotifCreneauDejaReserve  = "creneau_deja_reserve"
	MotifEchelleLongueur     = "echelle_longueur"
	MotifEchelleDecroissante = "echelle_decroissante"
	MotifEchelleHorsBareme   = "echelle_hors_bareme"

	// Lignes d'un fichier d'import
	MotifCelluleInvalide     = "cellule_invalide"
	MotifEleveInconnu        = "eleve_inconnu"
	MotifNoteSurNonEvalue    = "note_sur_eleve_non_evalue"
	MotifEmailManquant       = "email_manquant"
	MotifNatureInvalide      = "nature_invalide"
	MotifRoleInconnu         = "role_inconnu"
	MotifRoleSurEleve        = "role_sur_eleve"
	MotifStructureInattendue = "structure_inattendue"
)

// LigneErreur décrit une ligne fautive d'un fichier d'import : des données,
// pas une phrase — le front les rend en tableau et possède les mots.
type LigneErreur struct {
	// Numéro tel qu'il s'affiche dans le tableur ; absent quand l'import ne
	// trace pas ses lignes (périodes).
	Ligne    int    `json:"ligne,omitempty"`
	Champ    string `json:"champ,omitempty"`
	Motif    string `json:"motif"`
	Valeur   string `json:"valeur,omitempty"`
	Eleve    string `json:"eleve,omitempty"`
	Remarque string `json:"remarque,omitempty"`
}

// ConstraintRule définit la correspondance entre une contrainte SQL et un
// champ de l'API. Le motif est un code : c'est errorMessages.ts qui le traduit.
type ConstraintRule struct {
	Field string
	Motif string
}

// ConstraintError est la valeur retournée dans la map d'erreurs de validation.
// Detail est renseigné pour les violations d'exclusion (23P01) afin de permettre
// au frontend d'afficher le créneau conflictuel précis. Max porte la borne du
// barème quand le motif est note_hors_bareme — seul motif paramétré.
type ConstraintError struct {
	Motif  string   `json:"motif"`
	Detail string   `json:"detail,omitempty"`
	Max    *float32 `json:"max,omitempty"`
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
				errorsMap[rule.Field] = ConstraintError{Motif: rule.Motif}
			}
		case "23502": // NOT NULL violation
			errorsMap[pgErr.ColumnName] = ConstraintError{Motif: MotifChampObligatoire}
		case "23505": // UNIQUE violation
			if rule, ok := constraints[pgErr.ConstraintName]; ok {
				errorsMap[rule.Field] = ConstraintError{Motif: rule.Motif}
			}
		case "23503": // Foreign key violation
			if rule, ok := constraints[pgErr.ConstraintName]; ok {
				errorsMap[rule.Field] = ConstraintError{Motif: rule.Motif}
			}
		case "23P01": // Exclusion constraint violation
			if rule, ok := constraints[pgErr.ConstraintName]; ok {
				errorsMap[rule.Field] = ConstraintError{Motif: rule.Motif, Detail: pgErr.Detail}
			}
		}
	}

	return errorsMap
}
