-- name: FetchMobilitesByPromotionId :many
SELECT m.id, m.version, m.user_id, m.pays, m.ville, m.type_mobilite,
    m.date_debut, m.date_fin, m.est_valide, m.remarque, m.promotion_id,
    u."firstName", u."lastName"
FROM public.mobilite_internationale m
JOIN public."user" u ON m.user_id = u.id
WHERE m.promotion_id = @promotion_id;

-- name: FetchMobiliteById :one
SELECT m.id, m.version, m.user_id, m.pays, m.ville, m.type_mobilite,
    m.date_debut, m.date_fin, m.est_valide, m.remarque, m.promotion_id,
    u."firstName", u."lastName"
FROM public.mobilite_internationale m
JOIN public."user" u ON m.user_id = u.id
WHERE m.id = @id;

-- name: CheckPromotionExistsMobilite :one
SELECT 1 FROM public.promotion_active WHERE id = @id;
