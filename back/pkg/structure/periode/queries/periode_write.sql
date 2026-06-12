-- name: CreatePeriode :one
INSERT INTO periode ( name, debut, fin, option_id) VALUES (@name, @debut, @fin, @option_id) RETURNING id;

-- name: UpdatePeriode :one
UPDATE periode SET name = @name, debut = @debut, fin = @fin,version = version + 1 WHERE id = @id AND version = @version RETURNING version;

-- name: DeletePeriode :exec
DELETE FROM periode WHERE id = ANY(@ids::int[]);

