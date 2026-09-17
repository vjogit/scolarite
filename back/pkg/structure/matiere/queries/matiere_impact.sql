-- name: FetchMatiereNamesByIds :many
SELECT id, name FROM public.matiere WHERE id = ANY(@ids::int[]) ORDER BY id;

-- Analyse d'impact d'une suppression en masse de matières (correction A1, 17
-- septembre 2026 — la matière n'en avait aucune : sa fiche syllabus partait
-- sans un mot). Suppression physique, pas de corbeille.
-- name: MatiereDeleteImpact :one
WITH matiere_c AS (
    SELECT id FROM public.matiere WHERE id = ANY(@ids::int[])
),
controle_c AS (
    SELECT ct.id FROM public.controle ct JOIN matiere_c m ON ct.matiere_id = m.id
)
SELECT
    -- Syllabus : 0 ou 1 fiche par matière (FK unique).
    (SELECT count(*) FROM public.syllabus_matiere sm WHERE sm.matiere_id IN (SELECT id FROM matiere_c))::bigint AS syllabus_matiere_count,
    (SELECT count(*) FROM controle_c)::bigint AS controle_count,
    (SELECT count(*) FROM public.note n WHERE n.controle_id IN (SELECT id FROM controle_c))::bigint AS note_count,
    -- ON DELETE SET NULL : les réservations gardent leur période, perdent leur matière.
    (SELECT count(*) FROM public.reservation r WHERE r.matiere_id IN (SELECT id FROM matiere_c))::bigint AS reservation_detachee_count;
