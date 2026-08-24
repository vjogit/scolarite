package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
)

// L'enveloppe d'erreur suit la RFC 9457 (application/problem+json).
//
// `code` est un membre d'extension : c'est le contrat historique avec
// errorMessages.ts, le front route dessus. `type` et `title` s'adressent aux
// futurs consommateurs ; les URI `/erreurs/...` sont stables et volontairement
// non déréférençables — aucun contenu n'existe derrière.
//
// Le corps ne transporte jamais un err.Error() : le detail est rédigé pour
// l'humain, l'erreur d'origine part au log serveur (voir ServerError).

// RenderError est l'unique point d'émission : c'est lui qui garantit que le
// `status` du corps est le statut HTTP réel, et que les extensions ne peuvent
// pas écraser les membres de l'enveloppe.
func RenderError(w http.ResponseWriter, r *http.Request, httpStatus int, code ErrorCode, detail string, extensions map[string]any, logPrefix string) {
	body := map[string]any{
		"type":   "/erreurs/" + strings.ToLower(strings.ReplaceAll(code.String(), "_", "-")),
		"title":  errorCodeTitles[code],
		"status": httpStatus,
		"code":   code,
	}
	if detail != "" {
		body["detail"] = detail
	}
	for k, v := range extensions {
		if _, reserve := body[k]; !reserve {
			body[k] = v
		}
	}

	slog.Debug("erreur", "type", logPrefix, "status", httpStatus, "code", code.String(), "detail", detail)

	w.Header().Set("Content-Type", "application/problem+json; charset=utf-8")
	w.WriteHeader(httpStatus)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("unable to render response", "logPrefix", logPrefix, "error", err)
	}
}

// Fonctions spécifiques
func InvalidRequestError(w http.ResponseWriter, r *http.Request, detail string, code ErrorCode, extensions map[string]any) {
	RenderError(w, r, 400, code, detail, extensions, "InvalidRequestError")
}

func AuthenticationError(w http.ResponseWriter, r *http.Request, detail string, code ErrorCode, extensions map[string]any) {
	RenderError(w, r, 401, code, detail, extensions, "AuthenticationError")
}

func AuthorizationError(w http.ResponseWriter, r *http.Request, detail string, code ErrorCode, extensions map[string]any) {
	RenderError(w, r, 403, code, detail, extensions, "AuthorizationError")
}

func ConflictError(w http.ResponseWriter, r *http.Request, detail string, code ErrorCode, extensions map[string]any) {
	RenderError(w, r, 409, code, detail, extensions, "ConflictError")
}

// ServerError est le seul chemin vers un 500 : le client reçoit un detail
// générique et un identifiant d'incident ; l'erreur d'origine, elle, ne quitte
// pas le log serveur. L'identifiant figure des deux côtés — c'est lui qui rend
// un signalement d'utilisateur exploitable dans les logs.
func ServerError(w http.ResponseWriter, r *http.Request, err error) {
	incident := incidentID()
	slog.Error("erreur serveur",
		"incident", incident,
		"err", err,
		"method", r.Method,
		"path", r.URL.Path,
	)
	RenderError(w, r, 500, INTERNAL_ERROR,
		"Une erreur interne est survenue.",
		map[string]any{"instance": "/incidents/" + incident},
		"ServerError")
}

// incidentID : 8 hexadécimaux, assez pour retrouver une ligne de log, assez
// court pour être recopié depuis un écran au téléphone.
func incidentID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "00000000"
	}
	return hex.EncodeToString(b)
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

// errorCodeTitles : le `title` RFC 9457, court et stable comme le veut la RFC.
// Le message complet destiné à l'écran vit dans errorMessages.ts.
var errorCodeTitles = map[ErrorCode]string{
	NO_INFORMATION:             "Erreur",
	VALIDATION_ERROR:           "Données invalides",
	OPTIMISTIC_LOCKING_FAILURE: "Conflit de version",
	MISSING_PARAM:              "Paramètre manquant",
	INVALID_PARAM:              "Paramètre invalide",
	NOT_FOUND:                  "Ressource introuvable",
	BUSINESS_CONFLICT:          "Conflit",
	INVALID_BODY:               "Corps de requête invalide",
	INVALID_FILE:               "Fichier refusé",
	FILE_TOO_LARGE:             "Fichier trop volumineux",
	FILE_MISSING:               "Fichier manquant",
	INVALID_FILE_EXTENSION:     "Extension non prise en charge",
	INSUFFICIENT_RIGHTS:        "Droits insuffisants",
	INTERNAL_ERROR:             "Erreur interne",
	NO_RESULT:                  "Aucun résultat",
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
