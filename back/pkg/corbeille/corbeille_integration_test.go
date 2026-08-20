package corbeille_test

// Tests d'intégration de la corbeille, dans le style des tests delete-impact :
// fixture partagée SeedStructureFixture, pool réel, handlers appelés en direct.
// Le package externe (_test) évite le cycle corbeille -> formation -> corbeille.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"cyb-react/pkg/corbeille"
	"cyb-react/pkg/services"
	"cyb-react/pkg/structure/formation"
	formationgen "cyb-react/pkg/structure/formation/gen"

	notegen "cyb-react/pkg/resultat/note/gen"
	optiongen "cyb-react/pkg/structure/option/gen"
	periodegen "cyb-react/pkg/structure/periode/gen"
	promotiongen "cyb-react/pkg/structure/promotion/gen"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// corbeilleRouter monte les handlers corbeille sans le middleware de rôles :
// on teste ici la mécanique, pas l'autorisation (couverte par RequireAllRoles).
func corbeilleRouter() chi.Router {
	r := chi.NewRouter()
	r.Get("/", corbeille.Lister)
	r.Post("/{opID}/restaurer", corbeille.Restaurer)
	r.Delete("/{opID}", corbeille.Purger)
	return r
}

func newRequest(t *testing.T, pool *pgxpool.Pool, method, path string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	return req.WithContext(context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool}))
}

func listerCorbeille(t *testing.T, pool *pgxpool.Pool) []corbeille.OperationCorbeille {
	t.Helper()
	rec := httptest.NewRecorder()
	corbeilleRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodGet, "/"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var ops []corbeille.OperationCorbeille
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &ops))
	return ops
}

// opUnique retourne l'identifiant de l'unique opération en corbeille.
func opUnique(t *testing.T, pool *pgxpool.Pool) int32 {
	t.Helper()
	ops := listerCorbeille(t, pool)
	require.Len(t, ops, 1)
	return ops[0].ID
}

func TestIntegration_Corbeille_SuppressionPropagee(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cbs")
	ctx := context.Background()

	marked, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacineFormation,
		[]int32{fixture.FormationID}, "kc-admin")
	require.NoError(t, err)
	require.Equal(t, int64(1), marked)

	// Plus rien ne sort d'aucune lecture, du sommet aux requêtes de notes —
	// les cas les plus éloignés de la racine sont les juges de paix.
	formations, err := formationgen.New(pool).FetchAllFormation(ctx)
	require.NoError(t, err)
	assert.Empty(t, formations, "la formation supprimée ne doit plus être listée")

	promotions, err := promotiongen.New(pool).FetchPromotionsByFormationID(ctx, fixture.FormationID)
	require.NoError(t, err)
	assert.Empty(t, promotions)

	options, err := optiongen.New(pool).FetchOptionsByPromotionID(ctx, fixture.PromotionID)
	require.NoError(t, err)
	assert.Empty(t, options)

	periodes, err := periodegen.New(pool).FetchPeriodesByOptionID(ctx, fixture.OptionID)
	require.NoError(t, err)
	assert.Empty(t, periodes)

	notes, err := notegen.New(pool).FetchNotesByUserID(ctx, fixture.UserIDs[0])
	require.NoError(t, err)
	assert.Empty(t, notes, "les notes d'une période en corbeille ne doivent plus sortir")

	_, err = notegen.New(pool).FetchInformationsFiche(ctx, fixture.ControleID)
	assert.Error(t, err, "la fiche traverse les quatre niveaux : elle ne doit plus rien trouver")

	grille, err := notegen.New(pool).FetchGrilleControle(ctx, notegen.FetchGrilleControleParams{
		ControleID: fixture.ControleID, GroupeID: fixture.GroupeID})
	require.NoError(t, err)
	assert.Empty(t, grille, "la grille de saisie ne doit plus avoir d'effectif")

	// Rien n'est détruit : les lignes sont marquées, pas supprimées.
	var nFormations, nNotes int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM formation WHERE deleted_at IS NOT NULL`).Scan(&nFormations))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM note`).Scan(&nNotes))
	assert.Equal(t, 1, nFormations)
	assert.Equal(t, 3, nNotes)
}

func TestIntegration_Corbeille_ListeRacinesSeules(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cbl")
	ctx := context.Background()

	_, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacineOption,
		[]int32{fixture.OptionID}, "kc-cbl1")
	require.NoError(t, err)

	ops := listerCorbeille(t, pool)
	require.Len(t, ops, 1, "une seule opération : ses périodes ne sont pas des entrées séparées")

	op := ops[0]
	assert.Equal(t, "option", op.RacineType)
	assert.Equal(t, "kc-cbl1", op.DeletedBy)
	require.NotNil(t, op.DeletedByNom, "le sub correspond à un utilisateur de la fixture")
	assert.False(t, op.DeletedAt.IsZero())

	require.Len(t, op.Items, 1)
	assert.Equal(t, fixture.OptionID, op.Items[0].ID)
	assert.Equal(t, "Option 1 cbl", op.Items[0].Name)

	counts := map[string]int64{}
	for _, entry := range op.Cascade {
		counts[entry.Entity] = entry.Count
	}
	assert.Equal(t, int64(2), counts["periode"])
	assert.Equal(t, int64(1), counts["unite_enseignement"])
	assert.Equal(t, int64(1), counts["matiere"])
	assert.Equal(t, int64(2), counts["controle"])
	assert.Equal(t, int64(3), counts["note"])
	assert.Equal(t, int64(1), counts["groupe"])
	assert.NotContains(t, counts, "option", "la racine est nommée dans items, pas comptée en cascade")
	assert.Empty(t, op.Blocking)
}

func TestIntegration_Corbeille_Restauration(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cbr")
	ctx := context.Background()

	_, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacineFormation,
		[]int32{fixture.FormationID}, "kc-admin")
	require.NoError(t, err)
	opID := opUnique(t, pool)

	rec := httptest.NewRecorder()
	corbeilleRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodPost,
		"/"+itoa(opID)+"/restaurer"))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	// Tout réapparaît, notes comprises.
	formations, err := formationgen.New(pool).FetchAllFormation(ctx)
	require.NoError(t, err)
	require.Len(t, formations, 1)

	notes, err := notegen.New(pool).FetchNotesByUserID(ctx, fixture.UserIDs[0])
	require.NoError(t, err)
	assert.Len(t, notes, 2)

	grille, err := notegen.New(pool).FetchGrilleControle(ctx, notegen.FetchGrilleControleParams{
		ControleID: fixture.ControleID, GroupeID: fixture.GroupeID})
	require.NoError(t, err)
	assert.NotEmpty(t, grille, "la grille de saisie retrouve son effectif")

	assert.Empty(t, listerCorbeille(t, pool), "l'opération restaurée quitte la corbeille")
}

func TestIntegration_Corbeille_PropagéNonRestaurableSeul(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cbp")
	ctx := context.Background()

	// La promotion part seule en corbeille (op1), puis sa formation (op2) :
	// deux opérations distinctes, la promotion garde la sienne.
	_, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacinePromotion,
		[]int32{fixture.PromotionID}, "kc-admin")
	require.NoError(t, err)
	op1 := opUnique(t, pool)

	_, err = corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacineFormation,
		[]int32{fixture.FormationID}, "kc-admin")
	require.NoError(t, err)

	ops := listerCorbeille(t, pool)
	require.Len(t, ops, 2)

	// Restaurer la promotion sous une formation en corbeille produirait un
	// orphelin invisible : refus explicite.
	rec := httptest.NewRecorder()
	corbeilleRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/"+itoa(op1)+"/restaurer"))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "restaurez d'abord")
	assert.Contains(t, rec.Body.String(), "parent_en_corbeille")

	// La formation restaurée, la promotion redevient restaurable — et sa
	// restauration ne concerne qu'elle : l'opération de la formation n'avait
	// pas re-marqué la promotion déjà en corbeille.
	var op2 int32
	for _, op := range ops {
		if op.ID != op1 {
			op2 = op.ID
		}
	}
	rec = httptest.NewRecorder()
	corbeilleRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/"+itoa(op2)+"/restaurer"))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	promotions, err := promotiongen.New(pool).FetchPromotionsByFormationID(context.Background(), fixture.FormationID)
	require.NoError(t, err)
	require.Len(t, promotions, 1, "seule la promotion vide réapparaît, l'autre reste en corbeille")
	assert.Equal(t, fixture.PromotionVide, promotions[0].ID)

	rec = httptest.NewRecorder()
	corbeilleRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/"+itoa(op1)+"/restaurer"))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	promotions, err = promotiongen.New(pool).FetchPromotionsByFormationID(context.Background(), fixture.FormationID)
	require.NoError(t, err)
	assert.Len(t, promotions, 2)
}

func TestIntegration_Corbeille_JuryBloqueLaMiseEnCorbeille(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cbj")
	services.SeedJuryResult(t, pool, fixture)

	// Le handler Delete de la formation porte le blocage : il refuse en 409
	// avant toute écriture, exactement comme pour la suppression physique.
	req := services.NewBulkIDsRequest(t, pool, http.MethodDelete, "/", []int32{fixture.FormationID})
	rec := httptest.NewRecorder()
	formation.Delete(rec, req)
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), services.ReasonJuryDelibere)

	assert.Empty(t, listerCorbeille(t, pool), "rien ne doit être parti en corbeille")
}

func TestIntegration_Corbeille_Purge(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cbg")
	ctx := context.Background()

	_, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacineOption,
		[]int32{fixture.OptionID}, "kc-admin")
	require.NoError(t, err)
	opID := opUnique(t, pool)

	rec := httptest.NewRecorder()
	corbeilleRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodDelete, "/"+itoa(opID)))
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	// Destruction réelle : le sous-arbre de l'option a physiquement disparu.
	var nOptions, nPeriodes, nNotes, nOps int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM option`).Scan(&nOptions))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM periode`).Scan(&nPeriodes))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM note`).Scan(&nNotes))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM corbeille_operation`).Scan(&nOps))
	assert.Equal(t, 1, nOptions, "seule l'option vide survit")
	assert.Equal(t, 0, nPeriodes)
	assert.Equal(t, 0, nNotes)
	assert.Equal(t, 0, nOps, "plus rien à restaurer")
}

func TestIntegration_Corbeille_PurgeBloqueeParJury(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cbq")
	ctx := context.Background()

	_, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacineOption,
		[]int32{fixture.OptionID}, "kc-admin")
	require.NoError(t, err)
	opID := opUnique(t, pool)

	// Résultat de jury inséré directement sur la période en corbeille : le cas
	// ne peut pas se produire par l'application (une période délibérée refuse
	// la corbeille), mais la purge doit le bloquer quand même.
	services.SeedJuryResult(t, pool, fixture)

	rec := httptest.NewRecorder()
	corbeilleRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodDelete, "/"+itoa(opID)))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), services.ReasonJuryDelibere)

	var nPeriodes int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM periode`).Scan(&nPeriodes))
	assert.Equal(t, 2, nPeriodes, "rien ne doit avoir été détruit")
}

func TestIntegration_Corbeille_CollisionHomonymeALaRestauration(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cbh")
	ctx := context.Background()

	_, err := corbeille.MettreEnCorbeille(ctx, pool, corbeille.RacineFormation,
		[]int32{fixture.FormationID}, "kc-admin")
	require.NoError(t, err)
	opID := opUnique(t, pool)

	// L'index d'unicité partiel autorise la création d'un homonyme actif...
	_, err = pool.Exec(ctx, `INSERT INTO formation (name, version) VALUES ($1, 1)`, "Formation cbh")
	require.NoError(t, err)

	// ... et la restauration doit alors échouer proprement, sans 500 ni
	// restauration partielle.
	rec := httptest.NewRecorder()
	corbeilleRouter().ServeHTTP(rec, newRequest(t, pool, http.MethodPost, "/"+itoa(opID)+"/restaurer"))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "homonyme_actif")

	var nActives int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM formation WHERE deleted_at IS NULL`).Scan(&nActives))
	assert.Equal(t, 1, nActives, "seul l'homonyme créé entre-temps est actif")
	require.Len(t, listerCorbeille(t, pool), 1, "l'opération reste restaurable après renommage")
}

func itoa(id int32) string {
	return strconv.Itoa(int(id))
}
