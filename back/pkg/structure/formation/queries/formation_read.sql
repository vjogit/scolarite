-- name: FetchAllFormation :many
SELECT id, version, name FROM public.formation;

-- name: FetchFormationById :one
SELECT id, version, name FROM formation WHERE id = @id;
