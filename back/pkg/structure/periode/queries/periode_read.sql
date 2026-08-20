-- name: FetchPeriodesByOptionID :many
SELECT * FROM public.periode_active
WHERE option_id = @option_id;

-- name: CheckOptionExists :one
SELECT 1 FROM public.option_active WHERE id = @id;

-- name: FetchPeriodeById :one
SELECT * FROM periode_active WHERE id = @id;
