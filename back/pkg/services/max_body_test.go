package services_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"cyb-react/pkg/services"
)

func echoHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			// Le comportement à vérifier : jamais de panique ici, même quand
			// http.MaxBytesReader coupe la lecture en cours de route (corps
			// sans Content-Length correct). La route retombe sur son code
			// d'erreur habituel (comportement inchangé, hors périmètre de ce
			// middleware) ; on se contente ici de constater l'absence de
			// panique et de 500.
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})
}

func TestMaxBodyMiddlewareRefuseAuDelaDeLaLimite(t *testing.T) {
	const limite = 10
	handler := services.MaxBodyMiddleware(limite)(echoHandler())

	corps := bytes.Repeat([]byte("a"), limite+1)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(corps))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("statut = %d, attendu %d", rec.Code, http.StatusRequestEntityTooLarge)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json; charset=utf-8" {
		t.Errorf("Content-Type = %q, attendu application/problem+json", ct)
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("corps illisible : %v", err)
	}
	if code, _ := body["code"].(string); code != "PAYLOAD_TOO_LARGE" {
		t.Errorf("code = %v, attendu PAYLOAD_TOO_LARGE", body["code"])
	}
	if status, _ := body["status"].(float64); int(status) != http.StatusRequestEntityTooLarge {
		t.Errorf("status du corps = %v, attendu %d", body["status"], http.StatusRequestEntityTooLarge)
	}
}

func TestMaxBodyMiddlewareLaisseSousLaLimiteInchange(t *testing.T) {
	const limite = 1024
	handler := services.MaxBodyMiddleware(limite)(echoHandler())

	corps := []byte(`{"note": 15}`)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(corps))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("statut = %d, attendu %d (le corps est sous la limite)", rec.Code, http.StatusOK)
	}
	if !bytes.Equal(rec.Body.Bytes(), corps) {
		t.Errorf("corps reçu = %q, attendu %q", rec.Body.Bytes(), corps)
	}
}

// Corps sans Content-Length fiable, plus long que la limite : le refus
// n'intervient pas au niveau du pré-contrôle (Content-Length), mais pendant
// la lecture, via http.MaxBytesReader. Le point à vérifier est l'absence de
// panique / 500 — pas un code précis, puisque c'est alors la route qui décide
// (voir services/max_body.go).
func TestMaxBodyMiddlewareCoupePendantLaLectureSansPanique(t *testing.T) {
	const limite = 10
	handler := services.MaxBodyMiddleware(limite)(echoHandler())

	corps := bytes.Repeat([]byte("a"), limite+1)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(corps))
	req.ContentLength = -1 // force le contournement du pré-contrôle Content-Length
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code == http.StatusInternalServerError {
		t.Fatalf("statut = 500 : la lecture au-delà de la limite ne doit jamais produire un 500")
	}
}
