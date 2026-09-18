package controle

import (
	"context"
	"cyb-react/pkg/resultat/controle/gen"
	"cyb-react/pkg/services"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Le détail d'un contrôle dit si sa période est délibérée (`jury_delibere`) :
// c'est ce que la grille de saisie lit pour se verrouiller, sans requête de
// plus — la définition reste celle du domaine jury.
func TestIntegration_ControleDetail_PorteJuryDelibere(t *testing.T) {
	pool := services.GetIntegrationDBPool(t)
	fixture := services.SeedStructureFixture(t, pool, "cdj")
	ctx := context.Background()

	detail := func() map[string]any {
		row, err := gen.New(pool).FetchControleById(ctx, fixture.ControleID)
		require.NoError(t, err)
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req = req.WithContext(context.WithValue(req.Context(), services.PgCtxKey, &services.Postgres{Db: pool}))
		req = req.WithContext(context.WithValue(req.Context(), ControleContextKey, &row))
		rec := httptest.NewRecorder()
		FetchControle(rec, req)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var corps map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &corps))
		return corps
	}

	avant := detail()
	assert.Equal(t, false, avant["jury_delibere"])
	assert.Contains(t, avant, "bareme", "le détail garde ce qu'il rapportait déjà")

	services.SeedJuryResult(t, pool, fixture)
	assert.Equal(t, true, detail()["jury_delibere"])
}
