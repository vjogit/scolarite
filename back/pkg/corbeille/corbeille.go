// Package corbeille porte la suppression logique des quatre entités
// structurantes (formation, promotion, option, période) et les trois gestes
// réservés au composite ADMIN : lister la corbeille, restaurer une opération,
// la purger. La mise en corbeille est propagée : marquer un parent marque tous
// ses descendants structurels dans la même transaction, et la restauration ne
// se fait que depuis la racine d'une opération.
package corbeille

import (
	"context"
	"cyb-react/pkg/corbeille/gen"
	"cyb-react/pkg/services"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Types de racine d'une opération de corbeille — les valeurs du CHECK de
// corbeille_operation.racine_type.
const (
	RacineFormation = "formation"
	RacinePromotion = "promotion"
	RacineOption    = "option"
	RacinePeriode   = "periode"
)

// libellesRacine accorde chaque type de racine pour les messages d'erreur.
var libellesRacine = map[string]string{
	RacineFormation: "la formation",
	RacinePromotion: "la promotion",
	RacineOption:    "l'option",
	RacinePeriode:   "la période",
}

// remplacé par une var car les tests unitaires surchargent la méthode.
var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var getPoolFromCtx = func(r *http.Request) *pgxpool.Pool {
	return services.GetPgCtx(r.Context()).Db
}

// MettreEnCorbeille marque logiquement les entités désignées et toute leur
// descendance structurelle, dans une seule transaction. Retourne le nombre de
// racines effectivement marquées : zéro signifie que rien n'était actif sous
// ces identifiants. Le contrôle du jury délibéré appartient à l'appelant — il
// est fait par les handlers Delete des entités, avant cet appel.
func MettreEnCorbeille(ctx context.Context, db *pgxpool.Pool, racineType string, ids []int32, deletedBy string) (int64, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	queries := gen.New(tx)

	opID, err := queries.CreateOperation(ctx, gen.CreateOperationParams{
		RacineType: racineType,
		DeletedBy:  deletedBy,
	})
	if err != nil {
		return 0, err
	}

	var marked int64
	switch racineType {
	case RacineFormation:
		marked, err = queries.MarkFormations(ctx, gen.MarkFormationsParams{OpID: &opID, Ids: ids})
	case RacinePromotion:
		marked, err = queries.MarkPromotions(ctx, gen.MarkPromotionsParams{OpID: &opID, Ids: ids})
	case RacineOption:
		marked, err = queries.MarkOptions(ctx, gen.MarkOptionsParams{OpID: &opID, Ids: ids})
	case RacinePeriode:
		marked, err = queries.MarkPeriodes(ctx, gen.MarkPeriodesParams{OpID: &opID, Ids: ids})
	default:
		return 0, fmt.Errorf("type de racine inconnu : %q", racineType)
	}
	if err != nil {
		return 0, err
	}
	if marked == 0 {
		// Rien d'actif à supprimer : la transaction est abandonnée, aucune
		// opération vide ne doit apparaître dans la corbeille.
		return 0, nil
	}

	// Descente niveau par niveau : chaque étage marque les enfants actifs des
	// lignes portant cette opération. Un sous-arbre déjà en corbeille garde
	// son opération d'origine et reste restaurable séparément.
	if racineType == RacineFormation {
		if err = queries.PropagateToPromotions(ctx, &opID); err != nil {
			return 0, err
		}
	}
	if racineType == RacineFormation || racineType == RacinePromotion {
		if err = queries.PropagateToOptions(ctx, &opID); err != nil {
			return 0, err
		}
	}
	if racineType != RacinePeriode {
		if err = queries.PropagateToPeriodes(ctx, &opID); err != nil {
			return 0, err
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return marked, nil
}

// OperationCorbeille est une entrée de la liste corbeille : une opération de
// suppression, ses racines nommées, et le chiffrage de ce que sa purge
// détruirait — mêmes structures que delete-impact pour que le front réutilise
// son affichage.
type OperationCorbeille struct {
	ID         int32     `json:"id"`
	RacineType string    `json:"racineType"`
	DeletedAt  time.Time `json:"deletedAt"`
	// Le sub Keycloak brut, repli d'affichage quand l'auteur n'a pas de
	// compte applicatif.
	DeletedBy string `json:"deletedBy"`
	// « Prénom Nom » si le sub correspond à un utilisateur connu.
	DeletedByNom *string                         `json:"deletedByNom"`
	Items        []services.DeleteImpactItem     `json:"items"`
	Cascade      []services.DeleteImpactEntry    `json:"cascade"`
	Detached     []services.DeleteImpactEntry    `json:"detached"`
	Blocking     []services.DeleteImpactBlocking `json:"blocking"`
}

// impactVersReponse convertit le chiffrage SQL en réponse delete-impact,
// dans le même ordre hiérarchique que les endpoints delete-impact existants.
func impactVersReponse(impact gen.PurgeImpactRow) *services.DeleteImpactResponse {
	resp := services.NewDeleteImpactResponse()
	resp.AddCascade("promotion", impact.PromotionCount)
	resp.AddCascade("toeic", impact.ToeicCount)
	resp.AddCascade("mobilite_internationale", impact.MobiliteCount)
	resp.AddCascade("option", impact.OptionCount)
	resp.AddCascade("groupe", impact.GroupeCount)
	resp.AddCascade("groupe_user", impact.GroupeUserCount)
	resp.AddCascade("periode", impact.PeriodeCount)
	resp.AddCascade("unite_enseignement", impact.UeCount)
	resp.AddCascade("matiere", impact.MatiereCount)
	resp.AddCascade("controle", impact.ControleCount)
	resp.AddCascade("note", impact.NoteCount)
	resp.AddCascade("reservation", impact.ReservationCount)
	resp.AddCascade("reservation_intervenant", impact.ReservationIntervenantCount)
	resp.AddCascade("reservation_salle", impact.ReservationSalleCount)
	resp.AddCascade("reservation_groupe", impact.ReservationGroupeCount)
	resp.AddCascade("jury_result", impact.JuryResultCount)
	resp.AddDetached("reservation", impact.ReservationDetacheeCount)
	if impact.JuryPeriodeCount > 0 {
		resp.AddBlocking(services.ReasonJuryDelibere, services.JuryDelibereMessage(impact.JuryPeriodeCount))
	}
	return resp
}

// Lister renvoie le contenu de la corbeille : les opérations, racines en
// tête, de la plus récente à la plus ancienne.
func Lister(w http.ResponseWriter, r *http.Request) {
	queries := getQueriesFromCtx(r)

	ops, err := queries.FetchOperations(r.Context())
	if err != nil {
		slog.Error("corbeille : lecture des opérations impossible", "error", err)
		services.InternalServerError(w, r, "Impossible de lire la corbeille", services.INTERNAL_ERROR, nil)
		return
	}

	result := make([]OperationCorbeille, 0, len(ops))
	for _, op := range ops {
		roots, err := queries.FetchOperationRoots(r.Context(), op.ID)
		if err != nil {
			slog.Error("corbeille : lecture des racines impossible", "op", op.ID, "error", err)
			services.InternalServerError(w, r, "Impossible de lire la corbeille", services.INTERNAL_ERROR, nil)
			return
		}

		rootIDs := make([]int32, 0, len(roots))
		items := make([]services.DeleteImpactItem, 0, len(roots))
		for _, root := range roots {
			rootIDs = append(rootIDs, root.ID)
			items = append(items, services.DeleteImpactItem{ID: root.ID, Name: root.Name})
		}

		impact, err := queries.PurgeImpact(r.Context(), gen.PurgeImpactParams{
			RacineType: op.RacineType,
			Ids:        rootIDs,
		})
		if err != nil {
			slog.Error("corbeille : chiffrage impossible", "op", op.ID, "error", err)
			services.InternalServerError(w, r, "Impossible de lire la corbeille", services.INTERNAL_ERROR, nil)
			return
		}
		resp := impactVersReponse(impact)

		var nom *string
		if op.DeletedByFirstName != nil || op.DeletedByLastName != nil {
			complet := strings.TrimSpace(deref(op.DeletedByFirstName) + " " + deref(op.DeletedByLastName))
			if complet != "" {
				nom = &complet
			}
		}

		result = append(result, OperationCorbeille{
			ID:           op.ID,
			RacineType:   op.RacineType,
			DeletedAt:    op.DeletedAt.Time,
			DeletedBy:    op.DeletedBy,
			DeletedByNom: nom,
			Items:        items,
			Cascade:      resp.Cascade,
			Detached:     resp.Detached,
			Blocking:     resp.Blocking,
		})
	}

	render.JSON(w, r, result)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// opFromURL lit et valide l'identifiant d'opération de l'URL, et charge
// l'opération. Écrit la réponse d'erreur et retourne false si elle n'existe
// pas.
func opFromURL(w http.ResponseWriter, r *http.Request) (gen.CorbeilleOperation, bool) {
	raw := chi.URLParam(r, "opID")
	id, err := strconv.Atoi(raw)
	if err != nil {
		services.InvalidRequestError(w, r, "identifiant d'opération invalide", services.INVALID_PARAM, nil)
		return gen.CorbeilleOperation{}, false
	}

	queries := getQueriesFromCtx(r)
	op, err := queries.FetchOperationById(r.Context(), int32(id))
	if errors.Is(err, pgx.ErrNoRows) {
		services.InvalidRequestError(w, r, "Opération de corbeille introuvable", services.NOT_FOUND, nil)
		return gen.CorbeilleOperation{}, false
	}
	if err != nil {
		slog.Error("corbeille : lecture de l'opération impossible", "op", id, "error", err)
		services.InternalServerError(w, r, "Impossible de lire la corbeille", services.INTERNAL_ERROR, nil)
		return gen.CorbeilleOperation{}, false
	}
	return op, true
}

// Restaurer remet en service tout ce qu'une opération avait mis en corbeille.
// Deux refus métier : un parent lui-même en corbeille (l'objet restauré
// serait invisible), et un homonyme actif créé entre-temps (l'index d'unicité
// partiel le détecte dans la transaction).
func Restaurer(w http.ResponseWriter, r *http.Request) {
	op, ok := opFromURL(w, r)
	if !ok {
		return
	}

	queries := getQueriesFromCtx(r)

	parents, err := queries.FetchDeletedParentsOfOperation(r.Context(), op.ID)
	if err != nil {
		slog.Error("corbeille : contrôle des parents impossible", "op", op.ID, "error", err)
		services.InternalServerError(w, r, "Restauration impossible", services.INTERNAL_ERROR, nil)
		return
	}
	if len(parents) > 0 {
		noms := make([]string, 0, len(parents))
		for _, p := range parents {
			noms = append(noms, fmt.Sprintf("%s « %s »", libellesRacine[p.ParentType], p.ParentName))
		}
		services.ConflictError(w, r,
			"Restauration impossible : restaurez d'abord "+strings.Join(noms, ", ")+".",
			services.BUSINESS_CONFLICT, map[string]interface{}{"reason": "parent_en_corbeille"})
		return
	}

	pool := getPoolFromCtx(r)
	tx, err := pool.Begin(r.Context())
	if err != nil {
		slog.Error("corbeille : transaction impossible", "op", op.ID, "error", err)
		services.InternalServerError(w, r, "Restauration impossible", services.INTERNAL_ERROR, nil)
		return
	}
	defer tx.Rollback(r.Context())

	txQueries := gen.New(tx)
	err = restore(r.Context(), txQueries, op.ID)
	if err == nil {
		err = txQueries.DeleteOperation(r.Context(), op.ID)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			// Un homonyme actif a été créé depuis la mise en corbeille :
			// rien n'est restauré, l'utilisateur doit d'abord traiter le
			// doublon.
			services.ConflictError(w, r,
				"Restauration impossible : un objet actif porte déjà l'un des noms à restaurer. Renommez-le ou supprimez-le d'abord.",
				services.BUSINESS_CONFLICT, map[string]interface{}{"reason": "homonyme_actif"})
			return
		}
		slog.Error("corbeille : restauration impossible", "op", op.ID, "error", err)
		services.InternalServerError(w, r, "Restauration impossible", services.INTERNAL_ERROR, nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// restore balaie les quatre tables : seules celles que l'opération avait
// marquées ont des lignes à remettre, les autres UPDATE sont sans effet.
func restore(ctx context.Context, queries *gen.Queries, opID int32) error {
	if err := queries.RestoreFormationsByOp(ctx, &opID); err != nil {
		return err
	}
	if err := queries.RestorePromotionsByOp(ctx, &opID); err != nil {
		return err
	}
	if err := queries.RestoreOptionsByOp(ctx, &opID); err != nil {
		return err
	}
	return queries.RestorePeriodesByOp(ctx, &opID)
}

// Purger détruit physiquement les racines d'une opération ; les ON DELETE
// CASCADE emportent la descendance, feuilles comprises. Le blocage du jury
// délibéré s'applique comme pour la suppression physique d'origine.
func Purger(w http.ResponseWriter, r *http.Request) {
	op, ok := opFromURL(w, r)
	if !ok {
		return
	}

	queries := getQueriesFromCtx(r)

	roots, err := queries.FetchOperationRoots(r.Context(), op.ID)
	if err != nil {
		slog.Error("corbeille : lecture des racines impossible", "op", op.ID, "error", err)
		services.InternalServerError(w, r, "Purge impossible", services.INTERNAL_ERROR, nil)
		return
	}
	rootIDs := make([]int32, 0, len(roots))
	for _, root := range roots {
		rootIDs = append(rootIDs, root.ID)
	}

	impact, err := queries.PurgeImpact(r.Context(), gen.PurgeImpactParams{
		RacineType: op.RacineType,
		Ids:        rootIDs,
	})
	if err != nil {
		slog.Error("corbeille : contrôle du jury impossible", "op", op.ID, "error", err)
		services.InternalServerError(w, r, "Purge impossible", services.INTERNAL_ERROR, nil)
		return
	}
	if impact.JuryPeriodeCount > 0 {
		services.ConflictError(w, r, services.JuryDelibereMessage(impact.JuryPeriodeCount), services.BUSINESS_CONFLICT,
			map[string]interface{}{"reason": services.ReasonJuryDelibere})
		return
	}

	pool := getPoolFromCtx(r)
	tx, err := pool.Begin(r.Context())
	if err != nil {
		slog.Error("corbeille : transaction impossible", "op", op.ID, "error", err)
		services.InternalServerError(w, r, "Purge impossible", services.INTERNAL_ERROR, nil)
		return
	}
	defer tx.Rollback(r.Context())

	txQueries := gen.New(tx)
	switch op.RacineType {
	case RacineFormation:
		err = txQueries.PurgeFormationsByOp(r.Context(), &op.ID)
	case RacinePromotion:
		err = txQueries.PurgePromotionsByOp(r.Context(), &op.ID)
	case RacineOption:
		err = txQueries.PurgeOptionsByOp(r.Context(), &op.ID)
	case RacinePeriode:
		err = txQueries.PurgePeriodesByOp(r.Context(), &op.ID)
	default:
		err = fmt.Errorf("type de racine inconnu : %q", op.RacineType)
	}
	if err == nil {
		// Résorbe l'opération purgée et toute opération imbriquée que la
		// cascade vient de vider.
		err = txQueries.DeleteEmptyOperations(r.Context())
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		slog.Error("corbeille : purge impossible", "op", op.ID, "error", err)
		services.InternalServerError(w, r, "Purge impossible", services.INTERNAL_ERROR, nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
