-- name: CreateControle :one
INSERT INTO controle ( name,  coeff, remarque, matiere_id, is_rattrapage) VALUES (@name, @coeff, @remarque, @matiere_id, @is_rattrapage) RETURNING id;

-- name: UpdateControle :one
UPDATE controle SET name = @name, coeff = @coeff, remarque = @remarque, is_rattrapage = @is_rattrapage, version = version + 1 WHERE id = @id AND version = @version RETURNING version;

-- name: DeleteControle :exec
DELETE FROM controle WHERE id = ANY(@ids::int[]);

