-- name: FetchControlesByMatiereId :many
SELECT * FROM public.controle
WHERE matiere_id = @matiere_id;

-- name: CheckMatiereExists :one
SELECT 1 FROM public.matiere WHERE id = @id;

-- Le barème remonte avec le contrôle : l'écran de saisie des notes interroge
-- déjà cette route pour is_rattrapage, il n'a pas à faire un second appel pour
-- connaître l'échelle sur laquelle il note.
-- name: FetchControleById :one
SELECT
    c.id,
    c.version,
    c.name,
    c.coeff,
    c.is_rattrapage,
    c.remarque,
    c.matiere_id,
    prom.bareme
FROM public.controle c
JOIN public.matiere m             ON m.id  = c.matiere_id
JOIN public.unite_enseignement ue ON ue.id = m.unite_enseignement_id
JOIN public.periode pe            ON pe.id = ue.periode_id
JOIN public.option o              ON o.id  = pe.option_id
JOIN public.promotion prom        ON prom.id = o.promotion_id
WHERE c.id = @id;
