-- name: FetchOptionsByPromotionID :many
SELECT * FROM public.option_active
WHERE promotion_id = @promotion_id;

-- name: CheckPromotionExists :one
SELECT 1 FROM public.promotion_active WHERE id = @id;

-- name: FetchOptionById :one
SELECT * FROM option_active WHERE id = @id;
