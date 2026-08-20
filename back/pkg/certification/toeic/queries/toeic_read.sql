-- name: FetchToeicsByPromotionId :many
SELECT t.id, t.score, t.date_passage, 
    t.remarque, t.version,  t.promotion_id, t.user_id,
    "firstName", u."lastName"
FROM public.toeic  t
JOIN public."user" u ON t.user_id = u.id
WHERE promotion_id = @promotion_id;

-- name: CheckPromotionExists :one
SELECT 1 FROM public.promotion_active WHERE id = @id;

-- name: FetchToeicById :one
SELECT t.id, t.score, t.date_passage, 
    t.remarque, t.version,  t.promotion_id, t.user_id,
    "firstName", u."lastName"
FROM public.toeic  t
JOIN public."user" u ON t.user_id = u.id
WHERE t.id = @id;