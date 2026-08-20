-- name: CreateFormation :one
INSERT INTO formation (name) VALUES (@name) RETURNING id;

-- name: UpdateFormation :one
UPDATE formation SET name = @name, version = version + 1 WHERE id = @id AND version = @version RETURNING version;
