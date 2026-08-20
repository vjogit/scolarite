-- name: FetchPromotionsByFormationID :many
SELECT * FROM public.promotion_active
WHERE formation_id = @formation_id;

-- name: CheckFormationExists :one
SELECT 1 FROM public.formation_active WHERE id = @id;

-- name: FetchPromotionById :one
SELECT * FROM promotion_active WHERE id = @id;
