package services

// Client du service de conversion HTML → PDF (Gotenberg, conteneur
// pdf-service de infra/container/compose.yaml). Module de services/ et non du
// domaine syllabus : la fiche syllabus (lot 5) est son premier consommateur,
// les bulletins de jury seront le second. Bibliothèque standard seulement —
// une requête multipart, une réponse binaire, rien qui justifie une
// dépendance.
//
// Contrat : ConvertirHTML reçoit un document HTML autonome (feuille de style
// en ligne, aucune ressource externe — Gotenberg n'a accès à rien d'autre) et
// rend le PDF entier, en mémoire. Rien n'est jamais transmis par morceaux à
// l'appelant : une réponse coupée à mi-chemin est une erreur, pas un PDF
// tronqué.
//
// Toute défaillance du service — injoignable, délai dépassé, statut non 2xx,
// corps illisible — revient en *ErreurServicePDF, que le handler traduit en
// 503 SERVICE_UNAVAILABLE (ServiceUnavailableError). L'erreur d'origine y
// est enveloppée pour le log ; elle ne sort jamais sur le fil.

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"strings"
	"time"
)

// PDFConfig : bloc `pdf` du config.yaml. L'URL vient de l'environnement
// (GOTENBERG_HOST), les délais et le nom de l'établissement sont des
// littéraux du gabarit — ils ne varient pas d'un environnement à l'autre.
//
// Deux délais, dissociés (17 septembre 2026) : Timeout borne la conversion
// entière (un rendu long est légitime, un livret entier passe par là) ;
// TimeoutConnexion ne borne que l'établissement de la connexion TCP. Le
// conteneur Gotenberg arrêté laisse son adresse sans hôte sur le réseau
// Docker : sans délai propre, chaque SYN attendait le délai total (503 en
// 25 s, mesuré) — un port fermé, lui, répond tout de suite.
type PDFConfig struct {
	URL              string        `yaml:"url"`
	Timeout          time.Duration `yaml:"timeout"`
	TimeoutConnexion time.Duration `yaml:"timeout_connexion"`
	// Etablissement : la marque portée par le pied de page des documents
	// (« IMT Mines Alès »). Une valeur, un endroit — les gabarits la lisent.
	Etablissement string `yaml:"etablissement"`
}

// ErreurServicePDF : le service de conversion n'a pas rendu de PDF. Cause
// enveloppée (réseau, délai, statut, lecture) pour le log serveur.
type ErreurServicePDF struct {
	Cause error
}

func (e *ErreurServicePDF) Error() string { return "service PDF indisponible : " + e.Cause.Error() }
func (e *ErreurServicePDF) Unwrap() error { return e.Cause }

// Route Gotenberg de conversion d'un HTML par Chromium.
const routeConversionHTML = "/forms/chromium/convert/html"

// Taille maximale d'un PDF accepté du service, en octets. Un livret de
// formation entière tient en quelques mégaoctets ; au-delà, c'est une
// réponse aberrante, pas un document.
const tailleMaxPDF = 64 << 20

// OptionsPDF : le format de page. Les valeurs sont celles que Gotenberg
// attend (pouces, chaînes décimales). A4Portrait couvre les documents du
// projet ; le gabarit peut préférer sa propre règle @page (PreferCSSPageSize).
type OptionsPDF struct {
	LargeurPouces string
	HauteurPouces string
	MargesPouces  string
	FondsImprimes bool
	TaillePageCSS bool
}

// A4Portrait, marges nulles : le gabarit porte ses propres marges dans ses
// pages, comme la maquette de docs/syllabus/fiche-maquette.html.
var A4Portrait = OptionsPDF{
	LargeurPouces: "8.27",
	HauteurPouces: "11.69",
	MargesPouces:  "0",
	FondsImprimes: true,
	TaillePageCSS: true,
}

// ConvertisseurPDF parle au service. Un seul par serveur, construit au
// démarrage ; nil quand l'URL est vide (le binaire tourne alors sans PDF, les
// routes qui en dépendent répondent 503).
type ConvertisseurPDF struct {
	url    string
	client *http.Client
}

// Délais par défaut quand le config.yaml n'en pose pas : 30 s pour la
// conversion (le délai de l'API Gotenberg elle-même), 2 s pour la connexion
// (un service sur le même réseau Docker répond en millisecondes).
const (
	delaiConversionDefaut = 30 * time.Second
	delaiConnexionDefaut  = 2 * time.Second
)

// NewConvertisseurPDF : client HTTP borné par les deux délais configurés —
// la connexion par le Dialer du transport, la conversion entière par le
// délai du client. Le transport est propre au client, jamais le transport
// par défaut partagé.
func NewConvertisseurPDF(cfg PDFConfig) *ConvertisseurPDF {
	delai := cfg.Timeout
	if delai <= 0 {
		delai = delaiConversionDefaut
	}
	delaiConnexion := cfg.TimeoutConnexion
	if delaiConnexion <= 0 {
		delaiConnexion = delaiConnexionDefaut
	}
	transport := &http.Transport{
		DialContext:         (&net.Dialer{Timeout: delaiConnexion}).DialContext,
		MaxIdleConns:        4,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: delaiConnexion,
	}
	return &ConvertisseurPDF{
		url:    strings.TrimRight(cfg.URL, "/"),
		client: &http.Client{Timeout: delai, Transport: transport},
	}
}

// ConvertirHTML envoie le document et rend le PDF complet. Le contexte de la
// requête entrante borne l'appel en plus du délai du client : un navigateur
// parti n'attend plus rien.
func (c *ConvertisseurPDF) ConvertirHTML(ctx context.Context, html []byte, options OptionsPDF) ([]byte, error) {
	if c == nil || c.url == "" {
		return nil, &ErreurServicePDF{Cause: errors.New("aucune URL de service configurée (pdf.url)")}
	}

	corps := &bytes.Buffer{}
	form := multipart.NewWriter(corps)
	fichier, err := form.CreateFormFile("files", "index.html")
	if err != nil {
		return nil, &ErreurServicePDF{Cause: err}
	}
	if _, err := fichier.Write(html); err != nil {
		return nil, &ErreurServicePDF{Cause: err}
	}
	champs := map[string]string{
		"paperWidth":        options.LargeurPouces,
		"paperHeight":       options.HauteurPouces,
		"marginTop":         options.MargesPouces,
		"marginBottom":      options.MargesPouces,
		"marginLeft":        options.MargesPouces,
		"marginRight":       options.MargesPouces,
		"printBackground":   fmt.Sprint(options.FondsImprimes),
		"preferCssPageSize": fmt.Sprint(options.TaillePageCSS),
	}
	for nom, valeur := range champs {
		if err := form.WriteField(nom, valeur); err != nil {
			return nil, &ErreurServicePDF{Cause: err}
		}
	}
	if err := form.Close(); err != nil {
		return nil, &ErreurServicePDF{Cause: err}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url+routeConversionHTML, corps)
	if err != nil {
		return nil, &ErreurServicePDF{Cause: err}
	}
	req.Header.Set("Content-Type", form.FormDataContentType())

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, &ErreurServicePDF{Cause: err}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		// Le corps d'erreur de Gotenberg est une phrase courte : utile au log,
		// jamais rendue au client.
		extrait, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, &ErreurServicePDF{Cause: fmt.Errorf("statut %d : %s", resp.StatusCode, strings.TrimSpace(string(extrait)))}
	}

	pdf, err := io.ReadAll(io.LimitReader(resp.Body, tailleMaxPDF+1))
	if err != nil {
		return nil, &ErreurServicePDF{Cause: err}
	}
	if len(pdf) > tailleMaxPDF {
		return nil, &ErreurServicePDF{Cause: fmt.Errorf("document au-delà de %d octets", tailleMaxPDF)}
	}
	if !bytes.HasPrefix(pdf, []byte("%PDF")) {
		return nil, &ErreurServicePDF{Cause: errors.New("la réponse n'est pas un PDF")}
	}
	return pdf, nil
}

// EstServicePDFIndisponible dit si une erreur vient du service de conversion.
func EstServicePDFIndisponible(err error) bool {
	var e *ErreurServicePDF
	return errors.As(err, &e)
}
