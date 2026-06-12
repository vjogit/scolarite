-- name: FetchPromotionsByFormationID :many
SELECT * FROM public.promotion
WHERE formation_id = @formation_id;

-- name: CheckFormationExists :one
SELECT 1 FROM public.formation WHERE id = @id;

-- name: FetchPromotionById :one
SELECT * FROM promotion WHERE id = @id;
