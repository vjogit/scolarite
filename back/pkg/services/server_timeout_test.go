package services_test

import (
	"bufio"
	"net"
	"net/http"
	"testing"
	"time"
)

// Vérifie le mécanisme de ReadHeaderTimeout tel que cmd/serveur/main.go le
// configure sur http.Server : une connexion qui n'envoie jamais ses en-têtes
// doit être fermée par le serveur, pas laissée ouverte indéfiniment
// (défense Slowloris, M1).
func TestReadHeaderTimeoutFermeUneConnexionLente(t *testing.T) {
	const timeout = 200 * time.Millisecond

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("écoute impossible : %v", err)
	}

	srv := &http.Server{
		Handler:           http.NewServeMux(),
		ReadHeaderTimeout: timeout,
	}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatalf("connexion impossible : %v", err)
	}
	defer conn.Close()

	// N'envoie jamais de ligne de requête ni d'en-têtes : le serveur doit
	// couper de son propre chef, sans qu'on lui force la main côté client.
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, err = bufio.NewReader(conn).ReadByte()
	if err == nil {
		t.Fatalf("la connexion aurait dû être fermée par ReadHeaderTimeout")
	}
}
