-- name: CreateUser :one
INSERT INTO "user" ("firstName","lastName",email,keycloak_id, type_personne) VALUES (@firstName,@lastName,@email,@keycloak_id, @type_personne) RETURNING id;

-- name: UpdateUser :one
UPDATE "user" SET "firstName" = @firstName, "lastName" = @lastName, email = @email, keycloak_id = @keycloak_id, type_personne = @type_personne, version = version + 1 WHERE id = @id AND version = @version RETURNING version;

-- name: DeleteUser :exec
DELETE FROM "user" WHERE id = ANY(@ids::int[]);
