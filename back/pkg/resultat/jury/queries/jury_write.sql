-- name: UpsertJuryResult :exec
-- Insère ou met à jour le résultat délibéré pour un élève/période/UE.
-- compte_cumul = false pour une période non prise en compte dans le GPA cumulé (ex: année échouée du redoublant).
INSERT INTO public.jury_result (user_id, periode_id, unite_enseignement_id, grade, gpa_index, ects, compte_cumul)
VALUES (@user_id, @periode_id, @unite_enseignement_id, @grade, @gpa_index, @ects, @compte_cumul)
ON CONFLICT (user_id, periode_id, unite_enseignement_id)
DO UPDATE SET
    grade        = EXCLUDED.grade,
    gpa_index    = EXCLUDED.gpa_index,
    ects         = EXCLUDED.ects,
    compte_cumul = EXCLUDED.compte_cumul,
    delibere_at  = now();

-- name: DeleteJuryResultByUserPeriode :exec
-- Annule la délibération d'un élève pour une période (permet corrections après jury).
DELETE FROM public.jury_result
WHERE user_id = @user_id AND periode_id = @periode_id;

-- name: FetchJuryResultByPeriode :many
-- Retourne tous les résultats délibérés pour une période (pour savoir qui a été statué).
SELECT
    jr.user_id::integer,
    jr.periode_id::integer,
    jr.unite_enseignement_id::integer,
    jr.grade::text,
    jr.gpa_index::my_null_integer,
    jr.compte_cumul::boolean,
    jr.delibere_at
FROM public.jury_result jr
WHERE jr.periode_id = @periode_id
ORDER BY jr.user_id, jr.unite_enseignement_id;

-- name: FetchJuryResultByUserPeriode :many
-- Retourne les résultats délibérés pour un élève sur une période donnée.
SELECT
    jr.user_id::integer,
    jr.periode_id::integer,
    jr.unite_enseignement_id::integer,
    jr.grade::text,
    jr.gpa_index::integer,
    jr.compte_cumul::boolean,
    jr.delibere_at
FROM public.jury_result jr
WHERE jr.user_id = @user_id AND jr.periode_id = @periode_id
ORDER BY jr.unite_enseignement_id;
