package services

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
)

type ErrorResponse struct {
	HTTPStatusCode int       `json:"-"`
	Code           ErrorCode `json:"code"`
	Message        string    `json:"message"`
	Details        any       `json:"details,omitempty"`
}

func (e *ErrorResponse) Render(w http.ResponseWriter, r *http.Request) error {
	render.Status(r, e.HTTPStatusCode)
	return nil
}

// Fonction générique pour toutes les erreurs
func RenderError(w http.ResponseWriter, r *http.Request, httpStatus int, code ErrorCode, message string, detail any, logPrefix string) {
	resp := &ErrorResponse{
		HTTPStatusCode: httpStatus,
		Code:           code,
		Message:        message,
		Details:        detail,
	}
	slog.Debug("erreur", "type", logPrefix, "response", resp)
	if err := render.Render(w, r, resp); err != nil {
		slog.Error("unable to render response", "logPrefix", logPrefix, "error", err)
	}
}

// Fonctions spécifiques
func InvalidRequestError(w http.ResponseWriter, r *http.Request, message string, code ErrorCode, detail any) {
	RenderError(w, r, 400, code, message, detail, "InvalidRequestError")
}

func AuthenticationError(w http.ResponseWriter, r *http.Request, message string, code ErrorCode, detail any) {
	RenderError(w, r, 401, code, message, detail, "AuthenticationError")
}

func AuthorizationError(w http.ResponseWriter, r *http.Request, message string, code ErrorCode, detail any) {
	RenderError(w, r, 403, code, message, detail, "AuthorizationError")
}

func ConflictError(w http.ResponseWriter, r *http.Request, message string, code ErrorCode, detail any) {
	RenderError(w, r, 409, code, message, detail, "ConflictError")
}

func InternalServerError(w http.ResponseWriter, r *http.Request, message string, code ErrorCode, detail any) {
	RenderError(w, r, 500, code, message, detail, "InternalServerError")
}

type ErrorCode int

const (
	NO_INFORMATION             ErrorCode = iota // 0 - aucun code spécifique
	VALIDATION_ERROR                            // 1 - échec de validation côté serveur (bean validator)
	OPTIMISTIC_LOCKING_FAILURE                  // 2 - conflit de version (optimistic locking)

	// Famille : paramètre de requête
	MISSING_PARAM // 3 - paramètre obligatoire absent (query/path/form)
	INVALID_PARAM // 4 - paramètre présent mais non parseable ou hors domaine

	// Famille : ressource
	NOT_FOUND // 5 - ressource référencée introuvable en base

	// Famille : conflit métier
	BUSINESS_CONFLICT // 6 - conflit de planning (salle, groupe, intervenant)

	// Famille : corps de requête
	INVALID_BODY // 7 - body absent, non parseable ou structure invalide

	// Famille : fichier
	INVALID_FILE           // 8 - fichier illisible, mauvais format interne ou contenu inattendu
	FILE_TOO_LARGE         // 9 - fichier dépasse la taille maximale autorisée
	FILE_MISSING           // 10 - champ fichier absent dans le formulaire multipart
	INVALID_FILE_EXTENSION // 11 - extension du fichier non supportée

	// Famille : droits
	INSUFFICIENT_RIGHTS // 12 - utilisateur authentifié sans le rôle requis

	// Famille : erreur serveur avec message lisible (500)
	INTERNAL_ERROR // 13 - erreur interne sans lien avec une entrée client

	// Famille : résultat vide
	NO_RESULT // 14 - requête valide mais aucune donnée trouvée
)

// errorCodeNames mappe chaque ErrorCode vers son identifiant stable
// exposé au client. Cette chaîne est le contrat avec le front : elle ne
// doit jamais changer même si l'ordre/la valeur de l'iota évolue.
var errorCodeNames = map[ErrorCode]string{
	NO_INFORMATION:             "NO_INFORMATION",
	VALIDATION_ERROR:           "VALIDATION_ERROR",
	OPTIMISTIC_LOCKING_FAILURE: "OPTIMISTIC_LOCKING_FAILURE",
	MISSING_PARAM:              "MISSING_PARAM",
	INVALID_PARAM:              "INVALID_PARAM",
	NOT_FOUND:                  "NOT_FOUND",
	BUSINESS_CONFLICT:          "BUSINESS_CONFLICT",
	INVALID_BODY:               "INVALID_BODY",
	INVALID_FILE:               "INVALID_FILE",
	FILE_TOO_LARGE:             "FILE_TOO_LARGE",
	FILE_MISSING:               "FILE_MISSING",
	INVALID_FILE_EXTENSION:     "INVALID_FILE_EXTENSION",
	INSUFFICIENT_RIGHTS:        "INSUFFICIENT_RIGHTS",
	INTERNAL_ERROR:             "INTERNAL_ERROR",
	NO_RESULT:                  "NO_RESULT",
}

func (c ErrorCode) String() string {
	if name, ok := errorCodeNames[c]; ok {
		return name
	}
	return "NO_INFORMATION"
}

func (c ErrorCode) MarshalJSON() ([]byte, error) {
	return json.Marshal(c.String())
}
