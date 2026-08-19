package jury

import (
	"context"
	"cyb-react/pkg/resultat/jury/gen"
	"cyb-react/pkg/services"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/xuri/excelize/v2"
)

const connParams2 = "postgres://postgres:root@localhost:5432/scolarite"

// La période visée n'est pas reproductible : c'est un identifiant relevé sur
// une base de travail. JURY_TEST_PERIODE_ID permet de la désigner ailleurs.
const periodeParDefaut = 772

func periodeCible(t *testing.T) int32 {
	t.Helper()
	if v := os.Getenv("JURY_TEST_PERIODE_ID"); v != "" {
		id, err := strconv.Atoi(v)
		if err != nil {
			t.Fatalf("JURY_TEST_PERIODE_ID invalide (%q) : %v", v, err)
		}
		return int32(id)
	}
	return periodeParDefaut
}

func TestJury(t *testing.T) {
	ctx := context.Background()

	conn, err := pgx.Connect(ctx, services.IntegrationDBURL(connParams2))
	if err != nil {
		// Un log.Fatal ici tuerait le binaire de test, et avec lui tous les
		// autres tests du paquet.
		t.Skipf("base de test inaccessible : %v", err)
	}
	defer conn.Close(ctx)

	periodeID := periodeCible(t)

	// Le jeu de données de ce test n'est pas construit par le test lui-même :
	// il suppose une période déjà remplie. Sans elle, la génération produirait
	// un classeur vide dont la réussite ne prouverait rien.
	var existe bool
	if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM public.periode WHERE id = $1)`, periodeID).Scan(&existe); err != nil {
		t.Fatalf("vérification de la période impossible : %v", err)
	}
	if !existe {
		t.Skipf("période %d absente de la base de test ; renseignez JURY_TEST_PERIODE_ID", periodeID)
	}

	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			t.Errorf("fermeture du classeur : %v", err)
		}
	}()

	s := NewJuryService(gen.New(conn), periodeID)
	// L'erreur était ignorée : une génération en échec produisait un fichier
	// vide et un test au vert.
	if err := s.GenerateJury(f); err != nil {
		t.Fatalf("génération du jury : %v", err)
	}

	// Écriture dans le répertoire temporaire du test, et non dans les sources.
	fileName := filepath.Join(t.TempDir(), "synthese_jury.xlsx")
	if err := f.SaveAs(fileName); err != nil {
		t.Fatalf("écriture du classeur : %v", err)
	}

	info, err := os.Stat(fileName)
	if err != nil {
		t.Fatalf("classeur introuvable après écriture : %v", err)
	}
	if info.Size() == 0 {
		t.Fatal("le classeur généré est vide")
	}
}
