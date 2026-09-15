-- Écritures du référentiel (lot 3). La formation d'un bloc et le bloc d'une
-- compétence ne se modifient pas : comme `periode_id` d'une UE, l'appartenance
-- est fixée à la création. Verrou optimiste sur les deux entités.

-- name: CreateBloc :one
INSERT INTO bloc_competence (formation_id, ordre, libelle, code, activites, modalites_evaluation)
VALUES (@formation_id, @ordre, @libelle, @code, @activites, @modalites_evaluation)
RETURNING *;

-- name: UpdateBloc :one
UPDATE bloc_competence
SET ordre = @ordre, libelle = @libelle, code = @code, activites = @activites,
    modalites_evaluation = @modalites_evaluation, version = version + 1
WHERE id = @id AND version = @version
RETURNING *;

-- name: DeleteBlocs :exec
DELETE FROM bloc_competence WHERE id = ANY(@ids::int[]);

-- name: CreateCompetence :one
INSERT INTO competence (bloc_id, ordre, action, contexte, finalites)
VALUES (@bloc_id, @ordre, @action, @contexte, @finalites)
RETURNING *;

-- name: UpdateCompetence :one
UPDATE competence
SET ordre = @ordre, action = @action, contexte = @contexte, finalites = @finalites, version = version + 1
WHERE id = @id AND version = @version
RETURNING *;

-- name: DeleteCompetences :exec
DELETE FROM competence WHERE id = ANY(@ids::int[]);
