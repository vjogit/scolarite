-- name: CreateSalle :one
INSERT INTO salle (name, capacite, equipement, type_salle, batiment)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

-- name: UpdateSalle :one
UPDATE salle
SET name = $1, capacite = $2, equipement = $3, type_salle = $4, batiment = $5, version = version + 1
WHERE id = $6 AND version = $7
RETURNING version;

-- name: DeleteSalle :exec
DELETE FROM salle WHERE id = ANY($1::int[]);
