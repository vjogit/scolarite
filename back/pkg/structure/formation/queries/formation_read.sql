-- Lectures sur formation_active : une formation en corbeille n'existe plus
-- pour l'application, seul le module corbeille voit la table nue.

-- name: FetchAllFormation :many
SELECT id, version, name FROM public.formation_active;

-- name: FetchFormationById :one
SELECT id, version, name FROM formation_active WHERE id = @id;
