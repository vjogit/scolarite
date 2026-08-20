-- name: CheckOptionExists :one
SELECT 1 FROM public.option WHERE id = $1;

-- name: FetchGroupeById :one
SELECT id, version, name, option_id FROM groupe WHERE id = $1;

-- name: FetchGroupesByOptionID :many
SELECT id, version, name, option_id FROM groupe WHERE option_id = $1;

-- name: FetchUserByEmail :one
SELECT id, version, "firstName", "lastName", email, keycloak_id, type_personne
FROM "user"
WHERE email = $1;

-- name: FetchUsersByGroupeID :many
SELECT u.id, u.version, u."firstName", u."lastName", u.email, u.keycloak_id, u.type_personne
FROM "user" u
INNER JOIN groupe_user gu ON gu.user_id = u.id
WHERE gu.groupe_id = $1
ORDER BY u."lastName", u."firstName";

