-- name: FetchOptionsByPromotionID :many
SELECT * FROM public.option
WHERE promotion_id = @promotion_id;

-- name: CheckPromotionExists :one
SELECT 1 FROM public.promotion WHERE id = @id;

-- name: FetchOptionById :one
SELECT * FROM option WHERE id = @id;
