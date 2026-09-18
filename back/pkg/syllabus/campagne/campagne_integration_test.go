package campagne_test

// La campagne de traduction (lot 6), contre une base réelle et le connecteur
// factice — aucun appel réseau. Ce que les tests affirment : la simulation
// appelle le traducteur et n'écrit rien ; l'application écrit ; relancer ne
// retraduit rien (idempotence par empreinte) ; une source dont seul le
// compteur de version avance n'est pas retraduite ; une automatique périmée
// est retraduite, une relue périmée est laissée sans --retraduire-relues ; une
// rubrique en échec n'écrit rien de sa fiche et la campagne continue ; le
// disjoncteur s'ouvre contre un fournisseur éteint.

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"cyb-react/pkg/ia/factice"
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/campagne"
	"cyb-react/pkg/syllabus/traduction"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func lancer(t *testing.T, pool *pgxpool.Pool, c *factice.Connecteur, o campagne.Options) *campagne.Rapport {
	t.Helper()
	o.Langue = traduction.LangueEn
	r, err := campagne.Traduire(context.Background(), pool, &traduction.Traducteur{Connecteur: c}, o)
	require.NoError(t, err)
	return r
}

func compter(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), sql, args...).Scan(&n))
	return n
}

func TestIntegration_Campagne_Cycle(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	f := services.SeedStructureFixture(t, pool, "camp1")
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}
	exec(`UPDATE unite_enseignement SET description = 'Pourquoi cette UE : les fondations du métier.' WHERE id = $1`, f.UeID)
	exec(`INSERT INTO syllabus_matiere (matiere_id, contexte, plan_cours, heures_cours) VALUES ($1, 'Les réseaux locaux.', E'- Ethernet\n- Wi-Fi', 20)`, f.MatiereID)
	nbTraductions := func() int {
		return compter(t, pool, `SELECT (SELECT count(*) FROM syllabus_matiere_traduction WHERE matiere_id = $1) + (SELECT count(*) FROM unite_enseignement_traduction WHERE ue_id = $2)`, f.MatiereID, f.UeID)
	}
	opts := campagne.Options{PromotionID: f.PromotionID}

	// Simulation : traducteur appelé (description + deux rubriques), rien d'écrit,
	// comparatif produit.
	c := &factice.Connecteur{}
	r := lancer(t, pool, c, opts)
	assert.Equal(t, 1, r.Fiches.Traduites)
	assert.Equal(t, 1, r.Descriptions.Traduites)
	assert.Len(t, c.Appels(), 3)
	assert.Zero(t, nbTraductions(), "la simulation n'écrit rien")
	require.Len(t, r.Comparatif, 2)
	var comparatif bytes.Buffer
	require.NoError(t, r.EcrireComparatif(&comparatif))
	assert.Contains(t, comparatif.String(), "| - Ethernet<br>- Wi-Fi | - [en] Ethernet<br>- [en] Wi-Fi |")

	// Application : écrit, automatique, modèle nommé, empreinte de la source.
	opts.Apply = true
	r = lancer(t, pool, &factice.Connecteur{}, opts)
	assert.Equal(t, 1, r.Fiches.Traduites)
	assert.Equal(t, 2, nbTraductions())
	assert.Equal(t, 1, compter(t, pool, `SELECT count(*) FROM syllabus_matiere_traduction t JOIN syllabus_matiere_source s USING (matiere_id)
		WHERE t.matiere_id = $1 AND t.statut = 'automatique' AND t.modele = 'factice/test' AND t.empreinte_source = s.empreinte
		  AND t.plan_cours = E'- [en] Ethernet\n- [en] Wi-Fi' AND t.objectifs IS NULL`, f.MatiereID))

	// Idempotence : tout est à jour, personne n'est appelé.
	c = &factice.Connecteur{}
	r = lancer(t, pool, c, opts)
	assert.Equal(t, 1, r.Fiches.AJour)
	assert.Equal(t, 1, r.Descriptions.AJour)
	assert.Empty(t, c.Appels())

	// La version de la source avance sans ses textes : toujours à jour.
	exec(`UPDATE syllabus_matiere SET heures_cours = 18, version = version + 1 WHERE matiere_id = $1`, f.MatiereID)
	exec(`UPDATE unite_enseignement SET ects = ects + 1, version = version + 1 WHERE id = $1`, f.UeID)
	c = &factice.Connecteur{}
	r = lancer(t, pool, c, opts)
	assert.Equal(t, 1, r.Fiches.AJour)
	assert.Empty(t, c.Appels())

	// Les textes changent. La fiche, automatique, est retraduite ; la
	// description, relue entre-temps, est laissée et rapportée.
	exec(`UPDATE syllabus_matiere SET contexte = 'Les réseaux locaux et étendus.' WHERE matiere_id = $1`, f.MatiereID)
	exec(`UPDATE unite_enseignement_traduction SET statut = 'relue', description = 'Why this unit.' WHERE ue_id = $1`, f.UeID)
	exec(`UPDATE unite_enseignement SET description = 'Pourquoi cette UE : les fondations et la pratique du métier.' WHERE id = $1`, f.UeID)
	r = lancer(t, pool, &factice.Connecteur{}, opts)
	assert.Equal(t, 1, r.Fiches.Retraduites)
	assert.Equal(t, 1, r.Descriptions.ReluesPerimees)
	require.Len(t, r.ReluesPerimees, 1)
	assert.Equal(t, 1, compter(t, pool, `SELECT count(*) FROM unite_enseignement_traduction WHERE ue_id = $1 AND statut = 'relue' AND description = 'Why this unit.'`, f.UeID))
	assert.Equal(t, 1, compter(t, pool, `SELECT count(*) FROM syllabus_matiere_traduction WHERE matiere_id = $1 AND contexte = '[en] Les réseaux locaux et étendus.' AND version = 2`, f.MatiereID))
	var rapport bytes.Buffer
	require.NoError(t, r.Ecrire(&rapport))
	assert.Contains(t, rapport.String(), "Relues périmées, laissées en l'état (1)")

	// --retraduire-relues assume la perte du statut.
	opts.RetraduireRelues = true
	r = lancer(t, pool, &factice.Connecteur{}, opts)
	assert.Equal(t, 1, r.Descriptions.Retraduites)
	assert.Equal(t, 1, compter(t, pool, `SELECT count(*) FROM unite_enseignement_traduction WHERE ue_id = $1 AND statut = 'automatique'`, f.UeID))
}

func TestIntegration_Campagne_EchecsEtDisjoncteur(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	f := services.SeedStructureFixture(t, pool, "camp2")
	ctx := context.Background()
	// Cinq matières à fiche sous l'UE de la fixture, plus la description.
	_, err := pool.Exec(ctx, `UPDATE unite_enseignement SET description = 'Une description assez longue pour que sa longueur soit jugée.' WHERE id = $1`, f.UeID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO syllabus_matiere (matiere_id, contexte) VALUES ($1, 'Un contexte assez long pour que sa longueur soit jugée par le garde-fou.')`, f.MatiereID)
	require.NoError(t, err)
	for i := 0; i < 4; i++ {
		_, err = pool.Exec(ctx, `WITH m AS (INSERT INTO matiere (name, version, heure, coeff, unite_enseignement_id) VALUES ($1, 1, 10, 1, $2) RETURNING id)
			INSERT INTO syllabus_matiere (matiere_id, contexte) SELECT id, 'Un autre contexte assez long pour que sa longueur soit jugée.' FROM m`, fmt.Sprintf("Matiere camp2 %d", i), f.UeID)
		require.NoError(t, err)
	}
	opts := campagne.Options{PromotionID: f.PromotionID, Apply: true}

	// Un modèle qui résume la description : sortie refusée, rien d'écrit pour
	// elle, et la campagne continue sur les fiches.
	bavard := &factice.Connecteur{Reponse: func(_, texte string) string {
		if strings.HasPrefix(texte, "Une description") {
			return "OK."
		}
		return factice.Prefixer(texte)
	}}
	r := lancer(t, pool, bavard, opts)
	assert.Equal(t, 1, r.Descriptions.Echecs)
	assert.Equal(t, 5, r.Fiches.Traduites)
	require.Len(t, r.Echecs, 1)
	assert.Equal(t, campagne.CauseSortieRefusee, r.Echecs[0].Cause)
	assert.Zero(t, compter(t, pool, `SELECT count(*) FROM unite_enseignement_traduction WHERE ue_id = $1`, f.UeID))

	// Fournisseur éteint : trois échecs, puis le disjoncteur — le reste n'est
	// pas tenté, et tout est dans le rapport.
	_, err = pool.Exec(ctx, `DELETE FROM syllabus_matiere_traduction WHERE matiere_id IN (SELECT id FROM matiere WHERE unite_enseignement_id = $1)`, f.UeID)
	require.NoError(t, err)
	eteint := &factice.Connecteur{Erreur: func(int) error { return errors.New("connexion refusée") }}
	r = lancer(t, pool, eteint, opts)
	assert.Len(t, eteint.Appels(), 3)
	assert.Equal(t, 3, r.TotalEchecs())
	assert.Equal(t, 3, r.Fiches.NonTentes+r.Descriptions.NonTentes)
	assert.Equal(t, campagne.CauseFournisseur, r.Echecs[0].Cause)

	// --limite borne ce qui part au traducteur.
	opts.Limite = 2
	c := &factice.Connecteur{}
	r = lancer(t, pool, c, opts)
	assert.Len(t, c.Appels(), 2)
	assert.Equal(t, 4, r.Fiches.NonTentes+r.Descriptions.NonTentes)

	// Promotion inconnue : campagne impossible, pas un rapport vide.
	_, err = campagne.Traduire(ctx, pool, &traduction.Traducteur{Connecteur: c}, campagne.Options{PromotionID: -1, Langue: "en"})
	assert.Error(t, err)
}
