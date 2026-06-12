package extraction

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-resty/resty/v2"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/transform"
)

func Extract[T any](content string,
	create func(items []string) *T, process func(salle T) error) error {

	items, err := getItems(content, create)
	if err != nil {
		return err
	}

	for _, item := range items {
		if err := process(item); err != nil {
			return err
		}
	}

	return nil
}

func getItems[T any](content string, create func(items []string) *T) ([]T, error) {

	// Crée un lecteur CSV
	reader := csv.NewReader(strings.NewReader(content))
	reader.FieldsPerRecord = -1
	reader.Comma = ';'
	reader.LazyQuotes = true
	// Lit tous les enregistrements (lignes) du fichier CSV
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	var items []T
	// Traite les données (exemple : affiche chaque ligne)
	for _, record := range records {
		if record[0] == "EOT" {
			break
		}
		item := create(record)
		if item == nil {
			continue
		}
		items = append(items, *item)
	}

	return items, nil
}

func GetData(targetURL string) (string, error) {
	// Effectuer la requête HTTP GET
	response, err := http.Get(targetURL)
	if err != nil {
		return "", err
	}
	defer response.Body.Close() // Fermer le corps de la réponse après utilisation
	stringResult, err := readBody(response.Body)
	if err != nil {
		return "", err
	}

	if !strings.Contains(stringResult, "EOT") {
		fmt.Println("Lecture incomplete! ")
		rest, err := readBody(response.Body)
		if err != nil {
			stringResult += rest
		}
	}

	return stringResult, nil

}

var restyClient = resty.New().
	SetTimeout(30 * time.Second).
	SetRetryCount(3).
	SetRetryWaitTime(2 * time.Second).
	SetRetryMaxWaitTime(10 * time.Second)

func GetDataWithResty(url string) (string, error) {
	resp, err := restyClient.R().Get(url)
	if err != nil {
		return "", fmt.Errorf("erreur de connexion après plusieurs tentatives: %w", err)
	}
	if resp.IsError() {
		return "", fmt.Errorf("le serveur a répondu une erreur: %s", resp.Status())
	}
	return decodeISO8859(resp.Body())
}

func readBody(respBody io.ReadCloser) (string, error) {
	body, err := io.ReadAll(respBody)
	if err != nil {
		return "", err
	}
	return decodeISO8859(body)
}

func decodeISO8859(body []byte) (string, error) {
	decoder := charmap.ISO8859_1.NewDecoder()
	reader := transform.NewReader(bytes.NewReader(body), decoder)
	var buf bytes.Buffer
	_, err := buf.ReadFrom(reader)
	if err != nil {
		return "", err
	}
	return buf.String(), nil
}
