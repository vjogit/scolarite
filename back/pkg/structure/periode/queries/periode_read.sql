-- name: FetchPeriodesByOptionID :many
SELECT * FROM public.periode
WHERE option_id = @option_id;

-- name: CheckOptionExists :one
SELECT 1 FROM public.option WHERE id = @id;

-- name: FetchPeriodeById :one
SELECT * FROM periode WHERE id = @id;
