package services

import "net/http"

// MaxBodyMiddleware plafonne toute requête à `limit` octets — au-dessus des
// plafonds par route des imports (ParseMultipartForm), qui restent
// inchangés : c'est le filet global contre une requête sans borne (M4).
//
// Deux chemins vers le refus :
//   - Content-Length déclaré au-delà de la limite : refusé ici, avant même
//     de lire le corps. C'est le cas courant (JSON, axios le renseigne
//     toujours) et celui qui sort en PAYLOAD_TOO_LARGE — le code dédié
//     demandé par le lot.
//   - Content-Length absent ou mensonger (chunked, ou faux) : http.MaxBytesReader
//     coupe la lecture au premier octet en trop. L'erreur remonte alors à
//     chaque poignée via son décodage (render.DecodeJSON, ParseMultipartForm)
//     et ressort par le code déjà en place à cet endroit (INVALID_BODY ou
//     FILE_TOO_LARGE selon la route) — jamais une panique, jamais un 500 :
//     http.MaxBytesReader ne fait que renvoyer une erreur de lecture.
func MaxBodyMiddleware(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.ContentLength > limit {
				PayloadTooLargeError(w, r, "corps de requête trop volumineux", nil)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}
