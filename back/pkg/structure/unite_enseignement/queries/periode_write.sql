-- name: CreateUniteEnseignement :one
INSERT INTO unite_enseignement ( name, ects, academique, periode_id) VALUES (@name, @ects, @academique, @periode_id) RETURNING id;

-- name: UpdateUniteEnseignement :one
UPDATE unite_enseignement SET name = @name, ects = @ects, academique = @academique, version = version + 1 WHERE id = @id AND version = @version RETURNING version;

-- name: DeleteUniteEnseignement :exec
DELETE FROM unite_enseignement WHERE id = ANY(@ids::int[]);

