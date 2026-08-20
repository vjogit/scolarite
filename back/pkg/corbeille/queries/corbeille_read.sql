-- Lectures de la corbeille. Elles ciblent volontairement les tables nues :
-- la corbeille est l'écran qui montre ce que le reste de l'application cache.

-- name: FetchOperations :many
SELECT co.id, co.racine_type, co.deleted_at, co.deleted_by,
       u."firstName" AS deleted_by_first_name,
       u."lastName"  AS deleted_by_last_name
FROM corbeille_operation co
LEFT JOIN public."user" u ON u.keycloak_id = co.deleted_by
ORDER BY co.deleted_at DESC, co.id DESC;

-- name: FetchOperationById :one
SELECT co.id, co.racine_type, co.deleted_at, co.deleted_by
FROM corbeille_operation co
WHERE co.id = @id;

-- Les racines d'une opération : les lignes de la table désignée par
-- racine_type qui portent ce delete_op_id. Les lignes propagées des autres
-- tables ne sortent jamais ici — la corbeille ne liste que des racines.

-- name: FetchOperationRoots :many
SELECT t.id::integer AS id, t.name::text AS name
FROM corbeille_operation co
JOIN LATERAL (
    SELECT f.id, f.name FROM formation f WHERE co.racine_type = 'formation' AND f.delete_op_id = co.id
    UNION ALL
    SELECT p.id, p.name FROM promotion p WHERE co.racine_type = 'promotion' AND p.delete_op_id = co.id
    UNION ALL
    SELECT o.id, o.name FROM option o WHERE co.racine_type = 'option' AND o.delete_op_id = co.id
    UNION ALL
    SELECT pe.id, pe.name FROM periode pe WHERE co.racine_type = 'periode' AND pe.delete_op_id = co.id
) t ON true
WHERE co.id = @op_id
ORDER BY t.id;

-- Garde d'orphelin avant restauration : les parents encore en corbeille des
-- racines de l'opération. Vérifier le parent immédiat suffit — la propagation
-- garantit qu'un ancêtre supprimé a supprimé toute la lignée intermédiaire.

-- name: FetchDeletedParentsOfOperation :many
SELECT DISTINCT par.parent_type::text AS parent_type, par.parent_name::text AS parent_name
FROM corbeille_operation co
JOIN LATERAL (
    SELECT 'formation' AS parent_type, f.name AS parent_name
    FROM promotion p JOIN formation f ON f.id = p.formation_id
    WHERE co.racine_type = 'promotion' AND p.delete_op_id = co.id AND f.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'promotion', pr.name
    FROM option o JOIN promotion pr ON pr.id = o.promotion_id
    WHERE co.racine_type = 'option' AND o.delete_op_id = co.id AND pr.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'option', o.name
    FROM periode pe JOIN option o ON o.id = pe.option_id
    WHERE co.racine_type = 'periode' AND pe.delete_op_id = co.id AND o.deleted_at IS NOT NULL
) par ON true
WHERE co.id = @op_id;

-- Chiffrage de ce qu'une purge détruirait réellement : même descente que les
-- requêtes *DeleteImpact, mais sur les tables nues — la cascade physique
-- emporte tout le sous-arbre des racines, y compris un descendant mis en
-- corbeille par une opération distincte. Les décomptes excluent le niveau des
-- racines elles-mêmes (elles sont nommées à part), comme delete-impact.
-- jury_periode_count > 0 interdit la purge, comme il interdisait la
-- suppression physique.

-- name: PurgeImpact :one
WITH promotion_c AS (
    SELECT p.id FROM public.promotion p
    WHERE (@racine_type::text = 'formation' AND p.formation_id = ANY(@ids::int[]))
       OR (@racine_type::text = 'promotion' AND p.id = ANY(@ids::int[]))
),
option_c AS (
    SELECT o.id FROM public.option o
    WHERE o.promotion_id IN (SELECT id FROM promotion_c)
       OR (@racine_type::text = 'option' AND o.id = ANY(@ids::int[]))
),
periode_c AS (
    SELECT pe.id FROM public.periode pe
    WHERE pe.option_id IN (SELECT id FROM option_c)
       OR (@racine_type::text = 'periode' AND pe.id = ANY(@ids::int[]))
),
groupe_c AS (
    SELECT g.id FROM public.groupe g WHERE g.option_id IN (SELECT id FROM option_c)
),
ue_c AS (
    SELECT ue.id FROM public.unite_enseignement ue WHERE ue.periode_id IN (SELECT id FROM periode_c)
),
matiere_c AS (
    SELECT m.id FROM public.matiere m WHERE m.unite_enseignement_id IN (SELECT id FROM ue_c)
),
controle_c AS (
    SELECT ct.id FROM public.controle ct WHERE ct.matiere_id IN (SELECT id FROM matiere_c)
),
reservation_c AS (
    SELECT r.id FROM public.reservation r WHERE r.periode_id IN (SELECT id FROM periode_c)
),
jury_c AS (
    SELECT jr.user_id FROM public.jury_result jr
    WHERE jr.periode_id IN (SELECT id FROM periode_c)
       OR jr.unite_enseignement_id IN (SELECT id FROM ue_c)
),
reservation_groupe_c AS (
    SELECT rg.reservation_id FROM public.reservation_groupe rg
    WHERE rg.reservation_id IN (SELECT id FROM reservation_c)
       OR rg.groupe_id IN (SELECT id FROM groupe_c)
)
SELECT
    (SELECT count(*) FROM promotion_c WHERE @racine_type::text <> 'promotion')::bigint AS promotion_count,
    (SELECT count(*) FROM public.toeic t WHERE t.promotion_id IN (SELECT id FROM promotion_c))::bigint AS toeic_count,
    (SELECT count(*) FROM public.mobilite_internationale mi WHERE mi.promotion_id IN (SELECT id FROM promotion_c))::bigint AS mobilite_count,
    (SELECT count(*) FROM option_c WHERE @racine_type::text <> 'option')::bigint AS option_count,
    (SELECT count(*) FROM groupe_c)::bigint AS groupe_count,
    (SELECT count(*) FROM public.groupe_user gu WHERE gu.groupe_id IN (SELECT id FROM groupe_c))::bigint AS groupe_user_count,
    (SELECT count(*) FROM periode_c WHERE @racine_type::text <> 'periode')::bigint AS periode_count,
    (SELECT count(*) FROM ue_c)::bigint AS ue_count,
    (SELECT count(*) FROM matiere_c)::bigint AS matiere_count,
    (SELECT count(*) FROM controle_c)::bigint AS controle_count,
    (SELECT count(*) FROM public.note n WHERE n.controle_id IN (SELECT id FROM controle_c))::bigint AS note_count,
    (SELECT count(*) FROM reservation_c)::bigint AS reservation_count,
    (SELECT count(*) FROM public.reservation_intervenant ri WHERE ri.reservation_id IN (SELECT id FROM reservation_c))::bigint AS reservation_intervenant_count,
    (SELECT count(*) FROM public.reservation_salle rs WHERE rs.reservation_id IN (SELECT id FROM reservation_c))::bigint AS reservation_salle_count,
    (SELECT count(*) FROM reservation_groupe_c)::bigint AS reservation_groupe_count,
    (SELECT count(*) FROM jury_c)::bigint AS jury_result_count,
    (SELECT count(*) FROM periode_c pe
        WHERE EXISTS (SELECT 1 FROM public.jury_result jr WHERE jr.periode_id = pe.id))::bigint AS jury_periode_count,
    (SELECT count(*) FROM public.reservation r
        WHERE r.matiere_id IN (SELECT id FROM matiere_c)
          AND NOT EXISTS (SELECT 1 FROM reservation_c rc WHERE rc.id = r.id))::bigint AS reservation_detachee_count;
