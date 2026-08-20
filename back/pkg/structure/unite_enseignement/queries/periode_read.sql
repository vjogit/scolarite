-- name: FetchUniteEnseignementsByPeriodeID :many
SELECT * FROM public.unite_enseignement
WHERE periode_id = @periode_id;

-- name: CheckPeriodeExists :one
SELECT 1 FROM public.periode_active WHERE id = @id;

-- name: FetchUniteEnseignementById :one
SELECT * FROM unite_enseignement WHERE id = @id;

