-- name: CreateNote :one
INSERT INTO public.note (note, remarque, user_id, controle_id, is_validated, not_evaluated)
VALUES (@note, @remarque, @user_id, @controle_id, @is_validated, @not_evaluated)
RETURNING id;

-- name: UpdateNote :one
UPDATE public.note
SET
    note = @note,
    remarque = @remarque,
    user_id = @user_id,
    is_validated = @is_validated,
    not_evaluated = @not_evaluated,
    version = version + 1
WHERE
    id = @id AND version = @version
RETURNING version;

-- name: DeleteNote :exec
DELETE FROM public.note
WHERE id = ANY(@ids::int[]);