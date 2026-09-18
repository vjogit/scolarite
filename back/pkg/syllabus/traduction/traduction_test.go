package traduction_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"cyb-react/pkg/ia"
	"cyb-react/pkg/ia/factice"
	"cyb-react/pkg/syllabus/traduction"
)

func TestConsigne_PorteLeGlossaireEntier(t *testing.T) {
	for _, attendu := range []string{"- UE → teaching unit", "- TP → lab session", "- rattrapage → resit", "British spelling"} {
		if !strings.Contains(traduction.Consigne, attendu) {
			t.Errorf("la consigne ne porte pas %q", attendu)
		}
	}
}

func TestTraduire_EnvoieLaConsigneEtRendLaSortie(t *testing.T) {
	var systemeRecu string
	c := &factice.Connecteur{Reponse: func(systeme, utilisateur string) string {
		systemeRecu = systeme
		return "  " + factice.Prefixer(utilisateur) + "\r\n"
	}}
	tr := &traduction.Traducteur{Connecteur: c}

	source := "Introduction aux réseaux.\n\n- Couche liaison\n- Couche réseau"
	sortie, err := tr.Traduire(context.Background(), source)
	if err != nil {
		t.Fatalf("Traduire : %v", err)
	}
	if systemeRecu != traduction.Consigne {
		t.Error("la consigne du dépôt n'a pas été envoyée telle quelle")
	}
	if sortie != "[en] Introduction aux réseaux.\n\n- [en] Couche liaison\n- [en] Couche réseau" {
		t.Errorf("sortie inattendue : %q", sortie)
	}
}

func TestTraduire_TexteVide_NAppellePersonne(t *testing.T) {
	c := &factice.Connecteur{}
	tr := &traduction.Traducteur{Connecteur: c}
	if sortie, err := tr.Traduire(context.Background(), "  \n"); err != nil || sortie != "  \n" {
		t.Errorf("texte blanc : sortie %q, erreur %v", sortie, err)
	}
	if n := len(c.Appels()); n != 0 {
		t.Errorf("%d appel(s) pour un texte blanc", n)
	}
}

func TestTraduire_FournisseurEnPanne_RendIndisponible(t *testing.T) {
	c := &factice.Connecteur{Erreur: func(int) error { return errors.New("connexion refusée") }}
	_, err := (&traduction.Traducteur{Connecteur: c}).Traduire(context.Background(), "Un texte.")
	if !ia.EstIndisponible(err) {
		t.Errorf("erreur attendue : indisponible, reçue : %v", err)
	}
}

func TestVerifier_GardeFous(t *testing.T) {
	longue := strings.Repeat("Un paragraphe de cours assez long. ", 5)
	cas := []struct {
		nom, source, sortie string
		refuse              bool
	}{
		{"sortie vide", longue, "   ", true},
		{"résumé trop court", longue, "A course.", true},
		{"sortie bavarde", longue, strings.Repeat(longue, 4), true},
		{"puce perdue", "- un\n- deux", "- one and two", true},
		{"puce ajoutée", "Un texte sans liste, mais assez long pour compter.", "- A text\n- without a list, yet long enough to count.", true},
		{"texte court, rapport ignoré", "TP", "lab session", false},
		{"traduction plausible", "- un\n- deux\n\n" + longue, "- one\n- two\n\n" + longue, false},
	}
	for _, c := range cas {
		err := traduction.Verifier(c.source, c.sortie)
		var sortie *traduction.ErreurSortie
		if c.refuse != errors.As(err, &sortie) {
			t.Errorf("%s : refus attendu %v, erreur %v", c.nom, c.refuse, err)
		}
	}
}
