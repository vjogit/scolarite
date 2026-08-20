-- Écritures de la corbeille : seul endroit, avec la purge, où les tables nues
-- des quatre entités structurantes sont légitimes — tout le reste de
-- l'application lit les vues *_active.

-- name: CreateOperation :one
INSERT INTO corbeille_operation (racine_type, deleted_by)
VALUES (@racine_type, @deleted_by)
RETURNING id;

-- Marquage des racines. Seules les lignes actives sont touchées : un id déjà
-- en corbeille garde son opération d'origine. Le nombre de lignes marquées
-- remonte au handler — zéro signifie que rien n'était à supprimer.

-- name: MarkFormations :execrows
UPDATE formation SET deleted_at = now(), delete_op_id = @op_id
WHERE id = ANY(@ids::int[]) AND deleted_at IS NULL;

-- name: MarkPromotions :execrows
UPDATE promotion SET deleted_at = now(), delete_op_id = @op_id
WHERE id = ANY(@ids::int[]) AND deleted_at IS NULL;

-- name: MarkOptions :execrows
UPDATE option SET deleted_at = now(), delete_op_id = @op_id
WHERE id = ANY(@ids::int[]) AND deleted_at IS NULL;

-- name: MarkPeriodes :execrows
UPDATE periode SET deleted_at = now(), delete_op_id = @op_id
WHERE id = ANY(@ids::int[]) AND deleted_at IS NULL;

-- Propagation descendante, niveau par niveau, dans la même transaction que le
-- marquage des racines. La descente se fait par l'opération elle-même : les
-- enfants des seules lignes marquées par CE delete_op_id sont marqués à leur
-- tour. Un sous-arbre déjà en corbeille (opération antérieure) n'est pas
-- re-marqué : il reste restaurable séparément.

-- name: PropagateToPromotions :exec
UPDATE promotion SET deleted_at = now(), delete_op_id = @op_id
WHERE formation_id IN (SELECT id FROM formation WHERE delete_op_id = @op_id)
  AND deleted_at IS NULL;

-- name: PropagateToOptions :exec
UPDATE option SET deleted_at = now(), delete_op_id = @op_id
WHERE promotion_id IN (SELECT id FROM promotion WHERE delete_op_id = @op_id)
  AND deleted_at IS NULL;

-- name: PropagateToPeriodes :exec
UPDATE periode SET deleted_at = now(), delete_op_id = @op_id
WHERE option_id IN (SELECT id FROM option WHERE delete_op_id = @op_id)
  AND deleted_at IS NULL;

-- Restauration : tout ce que l'opération avait marqué, quatre tables
-- balayées. La violation de l'index d'unicité partiel (homonyme actif créé
-- entre-temps) fait échouer la transaction — le handler la traduit en 409.

-- name: RestoreFormationsByOp :exec
UPDATE formation SET deleted_at = NULL, delete_op_id = NULL WHERE delete_op_id = @op_id;

-- name: RestorePromotionsByOp :exec
UPDATE promotion SET deleted_at = NULL, delete_op_id = NULL WHERE delete_op_id = @op_id;

-- name: RestoreOptionsByOp :exec
UPDATE option SET deleted_at = NULL, delete_op_id = NULL WHERE delete_op_id = @op_id;

-- name: RestorePeriodesByOp :exec
UPDATE periode SET deleted_at = NULL, delete_op_id = NULL WHERE delete_op_id = @op_id;

-- name: DeleteOperation :exec
DELETE FROM corbeille_operation WHERE id = @id;

-- Purge : destruction physique des racines de l'opération ; les ON DELETE
-- CASCADE existants emportent toute la descendance, y compris un sous-arbre
-- mis en corbeille séparément — DeleteEmptyOperations résorbe ensuite les
-- opérations que la cascade a vidées.

-- name: PurgeFormationsByOp :exec
DELETE FROM formation WHERE delete_op_id = @op_id;

-- name: PurgePromotionsByOp :exec
DELETE FROM promotion WHERE delete_op_id = @op_id;

-- name: PurgeOptionsByOp :exec
DELETE FROM option WHERE delete_op_id = @op_id;

-- name: PurgePeriodesByOp :exec
DELETE FROM periode WHERE delete_op_id = @op_id;

-- name: DeleteEmptyOperations :exec
DELETE FROM corbeille_operation co
WHERE NOT EXISTS (SELECT 1 FROM formation WHERE delete_op_id = co.id)
  AND NOT EXISTS (SELECT 1 FROM promotion WHERE delete_op_id = co.id)
  AND NOT EXISTS (SELECT 1 FROM option WHERE delete_op_id = co.id)
  AND NOT EXISTS (SELECT 1 FROM periode WHERE delete_op_id = co.id);
