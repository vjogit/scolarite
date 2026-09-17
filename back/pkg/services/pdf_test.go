package services_test

// Le client du service PDF, contre un serveur HTTP de test qui joue Gotenberg :
// la requête est bien un multipart sur la route de conversion, avec le
// document et les options de page ; chaque défaillance revient en
// ErreurServicePDF, et une réponse qui n'est pas un PDF aussi.

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"cyb-react/pkg/services"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertisseurPDF_RequeteEtReponse(t *testing.T) {
	var recu struct {
		chemin  string
		champs  map[string]string
		fichier string
		nom     string
	}
	serveur := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recu.chemin = r.URL.Path
		require.NoError(t, r.ParseMultipartForm(1<<20))
		recu.champs = map[string]string{}
		for k, v := range r.MultipartForm.Value {
			recu.champs[k] = v[0]
		}
		f, en, err := r.FormFile("files")
		require.NoError(t, err)
		defer f.Close()
		contenu, _ := io.ReadAll(f)
		recu.fichier, recu.nom = string(contenu), en.Filename
		w.Header().Set("Content-Type", "application/pdf")
		_, _ = w.Write([]byte("%PDF-1.7\n%fake"))
	}))
	defer serveur.Close()

	c := services.NewConvertisseurPDF(services.PDFConfig{URL: serveur.URL + "/", Timeout: 5 * time.Second})
	pdf, err := c.ConvertirHTML(context.Background(), []byte("<html><body>x</body></html>"), services.A4Portrait)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(string(pdf), "%PDF"))

	assert.Equal(t, "/forms/chromium/convert/html", recu.chemin)
	assert.Equal(t, "index.html", recu.nom)
	assert.Equal(t, "<html><body>x</body></html>", recu.fichier)
	assert.Equal(t, "8.27", recu.champs["paperWidth"])
	assert.Equal(t, "11.69", recu.champs["paperHeight"])
	assert.Equal(t, "0", recu.champs["marginTop"])
	assert.Equal(t, "0", recu.champs["marginLeft"])
	assert.Equal(t, "true", recu.champs["printBackground"])
	assert.Equal(t, "true", recu.champs["preferCssPageSize"])
}

func TestConvertisseurPDF_Defaillances(t *testing.T) {
	cas := []struct {
		nom     string
		handler http.HandlerFunc
	}{
		{"statut 500", func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "chromium a échoué", http.StatusInternalServerError)
		}},
		{"statut 400", func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "paperWidth invalide", http.StatusBadRequest)
		}},
		{"corps qui n'est pas un PDF", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("<html>page de maintenance</html>"))
		}},
		{"délai dépassé", func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(300 * time.Millisecond)
		}},
	}
	for _, tc := range cas {
		t.Run(tc.nom, func(t *testing.T) {
			serveur := httptest.NewServer(tc.handler)
			defer serveur.Close()
			c := services.NewConvertisseurPDF(services.PDFConfig{URL: serveur.URL, Timeout: 100 * time.Millisecond})
			_, err := c.ConvertirHTML(context.Background(), []byte("<html></html>"), services.A4Portrait)
			require.Error(t, err)
			assert.True(t, services.EstServicePDFIndisponible(err), err.Error())
		})
	}

	t.Run("service injoignable — port fermé", func(t *testing.T) {
		c := services.NewConvertisseurPDF(services.PDFConfig{URL: "http://127.0.0.1:1", Timeout: time.Second})
		_, err := c.ConvertirHTML(context.Background(), []byte("<html></html>"), services.A4Portrait)
		require.Error(t, err)
		assert.True(t, services.EstServicePDFIndisponible(err))
	})

	// Le cas du conteneur arrêté : une adresse sans hôte, où le SYN reste
	// sans réponse. Le délai de connexion tranche seul, bien avant le délai
	// de conversion — c'est ce que l'utilisateur voit (503 en ~2 s au lieu
	// de 25). Adresse d'un réseau non routable (RFC 6598) ; le délai de
	// conversion est laissé long à dessein, pour prouver que c'est bien la
	// connexion qui a coupé.
	t.Run("service injoignable — adresse qui ne répond pas", func(t *testing.T) {
		c := services.NewConvertisseurPDF(services.PDFConfig{
			URL: "http://100.64.255.254:3000", Timeout: 10 * time.Second, TimeoutConnexion: 200 * time.Millisecond,
		})
		debut := time.Now()
		_, err := c.ConvertirHTML(context.Background(), []byte("<html></html>"), services.A4Portrait)
		duree := time.Since(debut)
		require.Error(t, err)
		assert.True(t, services.EstServicePDFIndisponible(err), err.Error())
		assert.Less(t, duree, 2*time.Second, "le délai de connexion doit trancher, pas celui de conversion")
	})

	t.Run("aucune URL configurée", func(t *testing.T) {
		c := services.NewConvertisseurPDF(services.PDFConfig{})
		_, err := c.ConvertirHTML(context.Background(), []byte("<html></html>"), services.A4Portrait)
		require.Error(t, err)
		assert.True(t, services.EstServicePDFIndisponible(err))
	})

	t.Run("client nil", func(t *testing.T) {
		var c *services.ConvertisseurPDF
		_, err := c.ConvertirHTML(context.Background(), []byte("<html></html>"), services.A4Portrait)
		assert.True(t, services.EstServicePDFIndisponible(err))
	})
}
