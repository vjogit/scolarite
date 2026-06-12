-- name: CreateGroupe :one
INSERT INTO groupe (name, option_id) VALUES ($1, $2) RETURNING id;

-- name: UpdateGroupe :one
UPDATE groupe SET name = $1, version = version + 1 WHERE id = $2 AND version = $3 RETURNING version;

-- name: DeleteGroupe :exec
DELETE FROM groupe WHERE id = ANY($1::int[]);

-- name: AddUserToGroupe :exec
INSERT INTO groupe_user (groupe_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;

-- name: RemoveUserFromGroupe :exec
DELETE FROM groupe_user WHERE groupe_id = $1 AND user_id = $2;
