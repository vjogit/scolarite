-- name: FetchAllUser :many
SELECT * FROM "user";

-- name: FetchUserById :one
SELECT * FROM "user" WHERE id = @id;

-- name: SearchUsers :many
SELECT id, "firstName", "lastName", email, version, type_personne
FROM "user"
WHERE 
    (@q::text = '' OR "lastName" ILIKE @q || '%' OR "firstName" ILIKE @q || '%')
ORDER BY "lastName", "firstName"
LIMIT 20;





