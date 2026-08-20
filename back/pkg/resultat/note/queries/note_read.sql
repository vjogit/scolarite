-- name: FetchNotesByControleID :many
SELECT n.id, n.version, n.note, n.remarque, n.user_id, n.controle_id, u."firstName", u."lastName", n.is_validated, n.not_evaluated
FROM public.note n
JOIN public."user" u ON n.user_id = u.id
WHERE n.controle_id = @controle_id
ORDER BY u."lastName", u."firstName";

-- name: FetchNoteById :one
SELECT n.id, n.version, n.note, n.remarque, n.user_id, n.controle_id, u."firstName", u."lastName", n.is_validated, n.not_evaluated
FROM public.note n
JOIN public."user" u ON n.user_id = u.id
WHERE n.id = @id;

-- name: FetchGpaByUserID :many
SELECT
    jr.periode_id,
    p.name AS periode_name,
    (SUM(
        CASE WHEN jr.gpa_index > 0 AND jr.ects IS NOT NULL
             THEN prom.echelle_gpa[jr.gpa_index] * jr.ects
             ELSE 0 END
    ) / NULLIF(SUM(jr.ects) FILTER (WHERE jr.gpa_index IS NOT NULL AND jr.ects IS NOT NULL), 0))::float AS gpa_periode,
    (SUM(
        CASE WHEN jr.gpa_index > 0 AND jr.ects IS NOT NULL AND ue.academique = TRUE
             THEN prom.echelle_gpa[jr.gpa_index] * jr.ects
             ELSE 0 END
    ) / NULLIF(SUM(jr.ects) FILTER (WHERE jr.gpa_index IS NOT NULL AND jr.ects IS NOT NULL AND ue.academique = TRUE), 0))::float AS gpa_academique_periode
FROM public.jury_result jr
JOIN public.periode_active p ON p.id = jr.periode_id
JOIN public.option_active o ON o.id = p.option_id
JOIN public.promotion_active prom ON prom.id = o.promotion_id
JOIN public.unite_enseignement ue ON ue.id = jr.unite_enseignement_id
WHERE jr.user_id = @user_id
GROUP BY jr.periode_id, p.name, p.debut
ORDER BY p.debut;

-- name: FetchNotesByUserID :many
SELECT
    n.id,
    n.note,
    n.remarque,
    n.is_validated,
    n.not_evaluated,
    n.controle_id,
    c.name  AS controle_name,
    c.coeff AS controle_coeff,
    c.is_rattrapage,
    m.id    AS matiere_id,
    m.name  AS matiere_name,
    ue.id   AS unite_enseignement_id,
    ue.name AS unite_enseignement_name,
    ue.ects AS unite_enseignement_ects,
    p.id    AS periode_id,
    p.name  AS periode_name
FROM public.note n
JOIN public.controle c   ON n.controle_id = c.id
JOIN public.matiere m    ON c.matiere_id = m.id
JOIN public.unite_enseignement ue ON m.unite_enseignement_id = ue.id
JOIN public.periode_active p    ON ue.periode_id = p.id
WHERE n.user_id = @user_id
ORDER BY p.debut, ue.name, m.name, c.is_rattrapage;

-- name: CheckControleExists :one
SELECT 1 FROM public.controle WHERE id = @id;

-- name: CheckMatiereExists :one
SELECT 1 FROM matiere WHERE id = $1;

-- name: CheckUniteEnseignementExists :one
SELECT 1 FROM unite_enseignement WHERE id = $1;

-- name: CheckPeriodeExists :one
SELECT 1 FROM periode_active WHERE id = $1;



-- Barème de la promotion dont dépend un contrôle. Remonte la chaîne
-- controle → matiere → ue → periode → option → promotion. Lu une fois par
-- requête d'écriture (et une seule fois par import), la borne étant ensuite
-- appliquée en mémoire.
-- name: FetchBaremeByControleID :one
SELECT prom.bareme
FROM public.controle c
JOIN public.matiere m             ON m.id  = c.matiere_id
JOIN public.unite_enseignement ue ON ue.id = m.unite_enseignement_id
JOIN public.periode_active pe            ON pe.id = ue.periode_id
JOIN public.option_active o              ON o.id  = pe.option_id
JOIN public.promotion_active prom        ON prom.id = o.promotion_id
WHERE c.id = @controle_id;
