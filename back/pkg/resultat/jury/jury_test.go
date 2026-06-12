package jury

import (
	"context"
	"cyb-react/pkg/resultat/jury/gen"
	"fmt"
	"log"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/xuri/excelize/v2"
)

const connParams2 = "postgres://postgres:root@localhost:5432/scolarite"

func TestJury(t *testing.T) {

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, connParams2)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close(ctx)

	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Printf("Erreur lors de la fermeture du fichier: %v\n", err)
		}
	}()

	s := NewJuryService(gen.New(conn), 772)
	s.GenerateJury(f)

	fileName := "synthese_hello_jaune.xlsx"
	if err := f.SaveAs(fileName); err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Le fichier '%s' a été généré avec succès !\n", fileName)

}
