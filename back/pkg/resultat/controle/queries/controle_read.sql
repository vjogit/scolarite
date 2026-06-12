-- name: FetchControlesByMatiereId :many
SELECT * FROM public.controle
WHERE matiere_id = @matiere_id;

-- name: CheckMatiereExists :one
SELECT 1 FROM public.matiere WHERE id = @id;

-- name: FetchControleById :one
SELECT * FROM public.controle WHERE id = @id;