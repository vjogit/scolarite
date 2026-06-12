-- name: FetchAllSalle :many
SELECT id, version, name, capacite, equipement, type_salle, batiment FROM salle ORDER BY name;

-- name: FetchSalleById :one
SELECT id, version, name, capacite, equipement, type_salle, batiment FROM salle WHERE id = $1;
