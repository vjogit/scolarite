-- name: CreateToeic :one
INSERT INTO toeic (score, date_passage, remarque, promotion_id, user_id) 
    VALUES (@score, @date_passage, @remarque, @promotion_id, @user_id) RETURNING id;

-- name: UpdateToeic :one
-- user_id est écrit comme les autres champs : le formulaire permet de changer
-- l'élève, et cette colonne manquait (défaut consigné au lot 14, fermé le
-- 17 septembre 2026).
UPDATE toeic SET score = @score, date_passage = @date_passage, remarque = @remarque, user_id = @user_id, version = version + 1 WHERE id = @id AND version = @version RETURNING version;

-- name: DeleteToeic :exec
DELETE FROM toeic WHERE id = ANY(@ids::int[]);

