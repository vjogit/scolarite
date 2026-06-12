-- name: CreateMatiere :one
INSERT INTO matiere (name, coeff, heure, unite_enseignement_id, color) VALUES (@name, @coeff, @heure, @unite_enseignement_id, @color) RETURNING id;

-- name: UpdateMatiere :one
UPDATE matiere SET name = @name, coeff = @coeff, heure = @heure, color = @color, version = version + 1 WHERE id = @id AND version = @version RETURNING version;

-- name: DeleteMatiere :exec
DELETE FROM matiere WHERE id = ANY(@ids::int[]);

