-- name: FetchPeriodeNamesByIds :many
SELECT id, name FROM public.periode_active WHERE id = ANY(@ids::int[]) ORDER BY id;

-- Analyse d'impact d'une suppression en masse de périodes.
-- name: PeriodeDeleteImpact :one
WITH periode_c AS (
    SELECT id FROM public.periode_active WHERE id = ANY(@ids::int[])
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
jury_c AS (
    SELECT jr.user_id FROM public.jury_result jr
    WHERE jr.periode_id IN (SELECT id FROM periode_c)
       OR jr.unite_enseignement_id IN (SELECT id FROM ue_c)
)
SELECT
    (SELECT count(*) FROM ue_c)::bigint AS ue_count,
    (SELECT count(*) FROM matiere_c)::bigint AS matiere_count,
    (SELECT count(*) FROM controle_c)::bigint AS controle_count,
    (SELECT count(*) FROM public.note n WHERE n.controle_id IN (SELECT id FROM controle_c))::bigint AS note_count,
    (SELECT count(*) FROM reservation_c)::bigint AS reservation_count,
    (SELECT count(*) FROM public.reservation_intervenant ri WHERE ri.reservation_id IN (SELECT id FROM reservation_c))::bigint AS reservation_intervenant_count,
    (SELECT count(*) FROM public.reservation_salle rs WHERE rs.reservation_id IN (SELECT id FROM reservation_c))::bigint AS reservation_salle_count,
    (SELECT count(*) FROM public.reservation_groupe rg WHERE rg.reservation_id IN (SELECT id FROM reservation_c))::bigint AS reservation_groupe_count,
    (SELECT count(*) FROM jury_c)::bigint AS jury_result_count,
    (SELECT count(*) FROM periode_c pe
        WHERE EXISTS (SELECT 1 FROM public.jury_result jr WHERE jr.periode_id = pe.id))::bigint AS jury_periode_count,
    (SELECT count(*) FROM public.reservation r
        WHERE r.matiere_id IN (SELECT id FROM matiere_c)
          AND NOT EXISTS (SELECT 1 FROM reservation_c rc WHERE rc.id = r.id))::bigint AS reservation_detachee_count;

-- name: CountPeriodeJuryDeliberePeriodes :one
SELECT count(*)::bigint FROM public.periode_active pe
WHERE pe.id = ANY(@ids::int[])
  AND EXISTS (SELECT 1 FROM public.jury_result jr WHERE jr.periode_id = pe.id);
