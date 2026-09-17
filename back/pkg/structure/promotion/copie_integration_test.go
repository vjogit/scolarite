package promotion

// Tests d'intégration de la création par gabarit (copie.go) : copie conforme
// table à table selon le périmètre tranché, indépendance après copie
// (modifier la copie ne touche pas la source), refus d'une source inconnue,
// en corbeille ou d'une autre formation, et promotion vide sans source.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cyb-react/pkg/corbeille"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/promotion/gen"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var rolesStructure = []string{services.RoleConsultation, services.RoleStructureEcriture}

func creerPromotion(t *testing.T, pool *pgxpool.Pool, corps CreationPromotion) *httptest.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(corps)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/promotion/", bytes.NewReader(raw))
	ctx := context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool})
	ctx = context.WithValue(ctx, services.KeycloakRolesCtxKey, rolesStructure)
	r := chi.NewRouter()
	r.Route("/promotion", RoutePromotion)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req.WithContext(ctx))
	return rec
}

func promotionNeuve(formationID int32, nom string) CreationPromotion {
	debut := time.Date(2027, 9, 1, 8, 0, 0, 0, time.UTC)
	return CreationPromotion{PromotionActive: gen.PromotionActive{
		Name:        nom,
		FormationID: formationID,
		Bareme:      20,
		EchelleGpa:  []float32{4, 3, 2, 1, 0.5, 0},
		Echelle:     []float32{16, 14, 12, 10, 8},
		Debut:       pgtype.Timestamptz{Time: debut, Valid: true},
		Fin:         pgtype.Timestamptz{Time: debut.Add(300 * 24 * time.Hour), Valid: true},
	}}
}

// compter rend le décompte d'une requête scalaire.
func compter(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), sql, args...).Scan(&n), sql)
	return n
}

// photo photographie, sous une promotion, tout ce que la copie recopie —
// sans les identifiants, avec les noms et le contenu — pour comparer source
// et copie, puis prouver que la source n'a pas bougé.
func photo(t *testing.T, pool *pgxpool.Pool, promotionID int32) string {
	t.Helper()
	var s string
	require.NoError(t, pool.QueryRow(context.Background(), `
		WITH o AS (SELECT * FROM option_active WHERE promotion_id = $1),
		     pe AS (SELECT pe.*, o.name AS o_name FROM periode_active pe JOIN o ON o.id = pe.option_id),
		     ue AS (SELECT ue.*, pe.name AS pe_name FROM unite_enseignement ue JOIN pe ON pe.id = ue.periode_id),
		     m AS (SELECT m.*, ue.name AS ue_name FROM matiere m JOIN ue ON ue.id = m.unite_enseignement_id),
		     b AS (SELECT * FROM bloc_competence WHERE promotion_id = $1),
		     c AS (SELECT c.*, b.ordre AS b_ordre FROM competence c JOIN b ON b.id = c.bloc_id)
		SELECT
		   coalesce((SELECT string_agg(name, '|' ORDER BY name) FROM o), '')
		|| '#' || coalesce((SELECT string_agg(o_name || ':' || name || ':' || debut::text || ':' || fin::text, '|' ORDER BY o_name, name) FROM pe), '')
		|| '#' || coalesce((SELECT string_agg(pe_name || ':' || name || ':' || ects || ':' || academique || ':' || coalesce(description, '') || ':' || coalesce(responsable_id::text, ''), '|' ORDER BY pe_name, name) FROM ue), '')
		|| '#' || coalesce((SELECT string_agg(ue_name || ':' || name || ':' || heure || ':' || coeff || ':' || coalesce(color, ''), '|' ORDER BY ue_name, name) FROM m), '')
		|| '#' || coalesce((SELECT string_agg(m.name || ':' || coalesce(sm.contexte, '') || ':' || coalesce(sm.plan_cours, '') || ':' || coalesce(sm.heures_cours_td::text, '') || ':' || coalesce(sm.heures_perso::text, '') || ':' || coalesce(sm.responsable_id::text, ''), '|' ORDER BY m.name)
		             FROM syllabus_matiere sm JOIN m ON m.id = sm.matiere_id), '')
		|| '#' || coalesce((SELECT string_agg(ordre || ':' || libelle || ':' || coalesce(code, '') || ':' || coalesce(activites, ''), '|' ORDER BY ordre) FROM b), '')
		|| '#' || coalesce((SELECT string_agg(b_ordre || ':' || ordre || ':' || action || ':' || coalesce(contexte, ''), '|' ORDER BY b_ordre, ordre) FROM c), '')
		|| '#' || coalesce((SELECT string_agg(ue.name || ':' || c.b_ordre || ':' || c.ordre || ':' || uc.enseignee || uc.mise_en_oeuvre || uc.evaluee, '|' ORDER BY ue.name, c.b_ordre, c.ordre)
		             FROM ue_competence uc JOIN ue ON ue.id = uc.ue_id JOIN c ON c.id = uc.competence_id), '')`,
		promotionID).Scan(&s))
	return s
}

func TestIntegration_CreatePromotion_ParGabarit(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "copie")
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}
	var agentID, blocID, c1, c2, ue2 int32
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO public."user" (version, "firstName", "lastName", email, type_personne)
		VALUES (1, 'Agent', 'Copie', 'agent-copie@test.invalid', 'AGENT') RETURNING id`).Scan(&agentID))

	// La source : la fixture (deux options dont une vide, deux périodes, une
	// UE, une matière, un contrôle, deux élèves) enrichie de tout ce que la
	// copie doit reprendre — et de ce qu'elle ne doit pas reprendre.
	exec(`UPDATE unite_enseignement SET description = 'Pourquoi cette UE', responsable_id = $1 WHERE id = $2`, agentID, fixture.UeID)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO unite_enseignement (name, version, ects, academique, periode_id) VALUES ('UE 2 copie', 1, 2, false, $1) RETURNING id`, fixture.PeriodeAutre).Scan(&ue2))
	exec(`INSERT INTO matiere (name, version, heure, coeff, color, unite_enseignement_id) VALUES ('Matiere 2 copie', 1, 12.5, 2, '#123456', $1)`, ue2)
	exec(`INSERT INTO syllabus_matiere (matiere_id, contexte, plan_cours, heures_cours_td, heures_tp, heures_perso, responsable_id)
		VALUES ($1, 'Contexte source', '1. Intro', 15, 4, 10, $2)`, fixture.MatiereID, agentID)
	exec(`UPDATE syllabus_matiere SET version = 3 WHERE matiere_id = $1`, fixture.MatiereID)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO bloc_competence (promotion_id, ordre, libelle, code, activites) VALUES ($1, 1, 'Bloc source', 'BC1', 'Activités') RETURNING id`, fixture.PromotionID).Scan(&blocID))
	exec(`INSERT INTO bloc_competence (promotion_id, ordre, libelle) VALUES ($1, 2, 'Bloc source 2')`, fixture.PromotionID)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO competence (bloc_id, ordre, action, contexte) VALUES ($1, 1, 'Analyser', 'en contexte') RETURNING id`, blocID).Scan(&c1))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO competence (bloc_id, ordre, action) VALUES ($1, 2, 'Concevoir') RETURNING id`, blocID).Scan(&c2))
	exec(`INSERT INTO ue_competence (ue_id, competence_id, enseignee, mise_en_oeuvre, evaluee) VALUES ($1, $2, true, false, true), ($1, $3, false, true, false)`, fixture.UeID, c1, c2)
	// Ce qui appartient aux élèves et à l'année : un groupe avec un élève (la
	// fixture porte déjà des notes sur le contrôle).
	var groupeID int32
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO groupe (name, version, option_id) VALUES ('Groupe copie', 1, $1) RETURNING id`, fixture.OptionID).Scan(&groupeID))
	exec(`INSERT INTO groupe_user (groupe_id, user_id) VALUES ($1, $2)`, groupeID, fixture.UserIDs[0])
	// Une autre formation, pour le refus.
	var autreFormation int32
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO formation (name, version) VALUES ('Formation autre copie', 1) RETURNING id`).Scan(&autreFormation))

	source := photo(t, pool, fixture.PromotionID)
	require.NotEmpty(t, source)
	notesAvant := compter(t, pool, `SELECT count(*) FROM note`)
	require.Positive(t, notesAvant)

	// Création par gabarit : 201, la promotion créée porte ses propres champs.
	corps := promotionNeuve(fixture.FormationID, "Promo copiée")
	corps.SourcePromotionID = &fixture.PromotionID
	rec := creerPromotion(t, pool, corps)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var creee gen.PromotionActive
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &creee))
	assert.NotEqual(t, fixture.PromotionID, creee.ID)
	assert.Equal(t, "Promo copiée", creee.Name)
	assert.Equal(t, int32(1), creee.Version)
	assert.NotContains(t, rec.Body.String(), "source_promotion_id")

	// Copie conforme, table à table : même photo (noms, dates telles quelles,
	// description et responsable de l'UE, matières, fiches avec responsable,
	// blocs, compétences, liaisons). La version de la fiche, hors photo, est
	// remise à 1 sur la copie.
	copie := photo(t, pool, creee.ID)
	assert.Equal(t, source, copie)
	assert.Contains(t, copie, "Matiere 1 copie:Contexte source:1. Intro:15.00:10.00:"+fmt.Sprint(agentID))
	assert.Equal(t, 1, compter(t, pool, `SELECT sm.version FROM syllabus_matiere sm JOIN matiere m ON m.id = sm.matiere_id
		JOIN unite_enseignement ue ON ue.id = m.unite_enseignement_id JOIN periode_active pe ON pe.id = ue.periode_id
		JOIN option_active o ON o.id = pe.option_id WHERE o.promotion_id = $1 AND m.name = 'Matiere 1 copie'`, creee.ID))
	assert.Contains(t, copie, "UE 1 copie:1:1:truefalsetrue")
	assert.Equal(t, 2, compter(t, pool, `SELECT count(*) FROM option_active WHERE promotion_id = $1`, creee.ID), "l'option vide est copiée aussi")
	assert.Equal(t, 2, compter(t, pool, `SELECT count(*) FROM periode_active pe JOIN option_active o ON o.id = pe.option_id WHERE o.promotion_id = $1`, creee.ID))
	assert.Equal(t, 2, compter(t, pool, `SELECT count(*) FROM bloc_competence WHERE promotion_id = $1`, creee.ID))

	// Rien de ce qui appartient aux élèves ou à l'année : aucun groupe,
	// contrôle, note, réservation sous la copie.
	assert.Equal(t, 0, compter(t, pool, `SELECT count(*) FROM groupe g JOIN option_active o ON o.id = g.option_id WHERE o.promotion_id = $1`, creee.ID))
	assert.Equal(t, 0, compter(t, pool, `SELECT count(*) FROM controle ct JOIN matiere m ON m.id = ct.matiere_id JOIN unite_enseignement ue ON ue.id = m.unite_enseignement_id
		JOIN periode_active pe ON pe.id = ue.periode_id JOIN option_active o ON o.id = pe.option_id WHERE o.promotion_id = $1`, creee.ID))
	assert.Equal(t, notesAvant, compter(t, pool, `SELECT count(*) FROM note`), "aucune note copiée")

	// Indépendance : modifier la copie ne touche pas la source, et inversement.
	exec(`UPDATE matiere SET name = 'Matiere renommée' WHERE unite_enseignement_id IN (
		SELECT ue.id FROM unite_enseignement ue JOIN periode_active pe ON pe.id = ue.periode_id JOIN option_active o ON o.id = pe.option_id WHERE o.promotion_id = $1) AND name = 'Matiere 1 copie'`, creee.ID)
	exec(`DELETE FROM ue_competence WHERE ue_id IN (
		SELECT ue.id FROM unite_enseignement ue JOIN periode_active pe ON pe.id = ue.periode_id JOIN option_active o ON o.id = pe.option_id WHERE o.promotion_id = $1)`, creee.ID)
	exec(`UPDATE bloc_competence SET libelle = 'Bloc réécrit' WHERE promotion_id = $1 AND ordre = 1`, creee.ID)
	assert.Equal(t, source, photo(t, pool, fixture.PromotionID), "la source n'a pas bougé")
	assert.NotEqual(t, source, photo(t, pool, creee.ID))
	exec(`UPDATE syllabus_matiere SET contexte = 'Source modifiée' WHERE matiere_id = $1`, fixture.MatiereID)
	assert.Contains(t, photo(t, pool, creee.ID), "Contexte source")

	// Sans source : promotion vide, comme avant.
	rec = creerPromotion(t, pool, promotionNeuve(fixture.FormationID, "Promo vide copie"))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var vide gen.PromotionActive
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &vide))
	assert.Equal(t, "#######", photo(t, pool, vide.ID), "huit sections, toutes vides")

	// Refus : source inconnue, source d'une autre formation, source en
	// corbeille — rien n'est créé (le nom reste libre).
	type probleme struct {
		Code   string                              `json:"code"`
		Errors map[string]services.ConstraintError `json:"errors"`
	}
	refus := func(source int32, formationID int32, motif string) {
		t.Helper()
		corps := promotionNeuve(formationID, "Promo refusée")
		corps.SourcePromotionID = &source
		rec := creerPromotion(t, pool, corps)
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		var p probleme
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &p))
		assert.Equal(t, "VALIDATION_ERROR", p.Code)
		assert.Equal(t, motif, p.Errors["source_promotion_id"].Motif)
		assert.Equal(t, 0, compter(t, pool, `SELECT count(*) FROM promotion_active WHERE name = 'Promo refusée'`))
	}
	refus(987654, fixture.FormationID, services.MotifReferenceInconnue)
	refus(fixture.PromotionID, autreFormation, services.MotifHorsFormation)
	_, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacinePromotion, []int32{fixture.PromotionVide}, "kc-test")
	require.NoError(t, err)
	refus(fixture.PromotionVide, fixture.FormationID, services.MotifReferenceInconnue)

	// Le nom d'une promotion reste unique parmi les actives, gabarit ou non :
	// la contrainte revient sur `name`, et la copie n'a rien laissé derrière.
	blocsAvant := compter(t, pool, `SELECT count(*) FROM bloc_competence`)
	corps = promotionNeuve(fixture.FormationID, "Promo copiée")
	corps.SourcePromotionID = &fixture.PromotionID
	rec = creerPromotion(t, pool, corps)
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	var p probleme
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &p))
	assert.Equal(t, services.MotifValeurDejaUtilisee, p.Errors["name"].Motif)
	assert.Equal(t, blocsAvant, compter(t, pool, `SELECT count(*) FROM bloc_competence`))
}
