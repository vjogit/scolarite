-- name: FetchUeNamesByIds :many
SELECT id, name FROM public.unite_enseignement WHERE id = ANY(@ids::int[]) ORDER BY id;

-- Analyse d'impact d'une suppression en masse d'UE (correction A1, 17
-- septembre 2026 — l'UE n'en avait aucune, sa modale disait « irréversible »
-- sans rien compter). Suppression physique, pas de corbeille : même descente
-- que PeriodeDeleteImpact à partir de l'UE. Les résultats de jury rattachés à
-- l'UE tombent par cascade (fk_jury_result_ue) et sont comptés comme tels ;
-- rien ne bloque, le DELETE ne bloque pas non plus.
-- name: UeDeleteImpact :one
WITH ue_c AS (
    SELECT id FROM public.unite_enseignement WHERE id = ANY(@ids::int[])
),
matiere_c AS (
    SELECT m.id FROM public.matiere m JOIN ue_c ue ON m.unite_enseignement_id = ue.id
),
controle_c AS (
    SELECT ct.id FROM public.controle ct JOIN matiere_c m ON ct.matiere_id = m.id
)
SELECT
    (SELECT count(*) FROM matiere_c)::bigint AS matiere_count,
    -- Syllabus : la fiche suit sa matière, la liaison UE ↔ compétence suit l'UE.
    (SELECT count(*) FROM public.syllabus_matiere sm WHERE sm.matiere_id IN (SELECT id FROM matiere_c))::bigint AS syllabus_matiere_count,
    (SELECT count(*) FROM controle_c)::bigint AS controle_count,
    (SELECT count(*) FROM public.note n WHERE n.controle_id IN (SELECT id FROM controle_c))::bigint AS note_count,
    (SELECT count(*) FROM public.jury_result jr WHERE jr.unite_enseignement_id IN (SELECT id FROM ue_c))::bigint AS jury_result_count,
    (SELECT count(*) FROM public.ue_competence uc WHERE uc.ue_id IN (SELECT id FROM ue_c))::bigint AS ue_competence_count,
    -- ON DELETE SET NULL : les réservations gardent leur période, perdent leur matière.
    (SELECT count(*) FROM public.reservation r WHERE r.matiere_id IN (SELECT id FROM matiere_c))::bigint AS reservation_detachee_count;
