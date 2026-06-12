-- name: CreateOption :one
INSERT INTO option ( name, promotion_id) VALUES (@name, @promotion_id) RETURNING id;

-- name: UpdateOption :one
UPDATE option SET name = @name, version = version + 1 WHERE id = @id AND version = @version RETURNING version;

-- name: DeleteOption :exec
DELETE FROM option WHERE id = ANY(@ids::int[]);

