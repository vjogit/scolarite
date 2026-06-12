-- name: FetchMatieresByUniteEnseignementID :many
SELECT * FROM public.matiere
WHERE unite_enseignement_id = @unite_enseignement_id;

-- name: CheckUniteEnseignementExists :one
SELECT 1 FROM public.unite_enseignement WHERE id = @id;

-- name: FetchMatiereById :one
SELECT * FROM public.matiere WHERE id = @id;