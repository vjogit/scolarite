-- name: FetchFormationNamesByIds :many
SELECT id, name FROM public.formation_active WHERE id = ANY(@ids::int[]) ORDER BY id;

-- Analyse d'impact d'une suppression en masse de formations.
-- Une seule requête : la chaîne de CTE descend l'arborescence des ON DELETE CASCADE
-- (cf. infra/liquibase/releases/v0.01) et le SELECT final agrège tous les décomptes.
-- name: FormationDeleteImpact :one
WITH cible AS (
    SELECT id FROM public.formation_active WHERE id = ANY(@ids::int[])
),
promotion_c AS (
    SELECT p.id FROM public.promotion_active p JOIN cible c ON p.formation_id = c.id
),
option_c AS (
    SELECT o.id FROM public.option_active o JOIN promotion_c p ON o.promotion_id = p.id
),
groupe_c AS (
    SELECT g.id FROM public.groupe g JOIN option_c o ON g.option_id = o.id
),
periode_c AS (
    SELECT pe.id FROM public.periode_active pe JOIN option_c o ON pe.option_id = o.id
),
ue_c AS (
    SELECT ue.id FROM public.unite_enseignement ue JOIN periode_c pe ON ue.periode_id = pe.id
),
matiere_c AS (
    SELECT m.id FROM public.matiere m JOIN ue_c ue ON m.unite_enseignement_id = ue.id
),
controle_c AS (
    SELECT ct.id FROM public.controle ct JOIN matiere_c m ON ct.matiere_id = m.id
),
reservation_c AS (
    SELECT r.id FROM public.reservation r JOIN periode_c pe ON r.periode_id = pe.id
),
-- jury_result est atteignable par periode_id ET par unite_enseignement_id :
-- un seul balayage avec OR évite de compter deux fois la même ligne.
jury_c AS (
    SELECT jr.user_id FROM public.jury_result jr
    WHERE jr.periode_id IN (SELECT id FROM periode_c)
       OR jr.unite_enseignement_id IN (SELECT id FROM ue_c)
),
-- idem pour reservation_groupe, atteignable par la réservation ET par le groupe.
reservation_groupe_c AS (
    SELECT rg.reservation_id FROM public.reservation_groupe rg
    WHERE rg.reservation_id IN (SELECT id FROM reservation_c)
       OR rg.groupe_id IN (SELECT id FROM groupe_c)
)
SELECT
    (SELECT count(*) FROM promotion_c)::bigint AS promotion_count,
    (SELECT count(*) FROM public.toeic t WHERE t.promotion_id IN (SELECT id FROM promotion_c))::bigint AS toeic_count,
    (SELECT count(*) FROM public.mobilite_internationale mi WHERE mi.promotion_id IN (SELECT id FROM promotion_c))::bigint AS mobilite_count,
    (SELECT count(*) FROM option_c)::bigint AS option_count,
    (SELECT count(*) FROM groupe_c)::bigint AS groupe_count,
    (SELECT count(*) FROM public.groupe_user gu WHERE gu.groupe_id IN (SELECT id FROM groupe_c))::bigint AS groupe_user_count,
    (SELECT count(*) FROM periode_c)::bigint AS periode_count,
    (SELECT count(*) FROM ue_c)::bigint AS ue_count,
    (SELECT count(*) FROM matiere_c)::bigint AS matiere_count,
    (SELECT count(*) FROM controle_c)::bigint AS controle_count,
    (SELECT count(*) FROM public.note n WHERE n.controle_id IN (SELECT id FROM controle_c))::bigint AS note_count,
    (SELECT count(*) FROM reservation_c)::bigint AS reservation_count,
    (SELECT count(*) FROM public.reservation_intervenant ri WHERE ri.reservation_id IN (SELECT id FROM reservation_c))::bigint AS reservation_intervenant_count,
    (SELECT count(*) FROM public.reservation_salle rs WHERE rs.reservation_id IN (SELECT id FROM reservation_c))::bigint AS reservation_salle_count,
    (SELECT count(*) FROM reservation_groupe_c)::bigint AS reservation_groupe_count,
    (SELECT count(*) FROM jury_c)::bigint AS jury_result_count,
    -- Blocage : périodes concernées ayant déjà des résultats de jury.
    (SELECT count(*) FROM periode_c pe
        WHERE EXISTS (SELECT 1 FROM public.jury_result jr WHERE jr.periode_id = pe.id))::bigint AS jury_periode_count,
    -- ON DELETE SET NULL : réservations détachées de leur matière sans être supprimées.
    (SELECT count(*) FROM public.reservation r
        WHERE r.matiere_id IN (SELECT id FROM matiere_c)
          AND NOT EXISTS (SELECT 1 FROM reservation_c rc WHERE rc.id = r.id))::bigint AS reservation_detachee_count;

-- name: CountFormationJuryDeliberePeriodes :one
SELECT count(*)::bigint FROM public.periode_active pe
WHERE pe.option_id IN (
        SELECT o.id FROM public.option_active o
        WHERE o.promotion_id IN (
            SELECT p.id FROM public.promotion_active p WHERE p.formation_id = ANY(@ids::int[])
        )
    )
  AND EXISTS (SELECT 1 FROM public.jury_result jr WHERE jr.periode_id = pe.id);
