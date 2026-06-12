-- name: CreateToeic :one
INSERT INTO toeic (score, date_passage, remarque, promotion_id, user_id) 
    VALUES (@score, @date_passage, @remarque, @promotion_id, @user_id) RETURNING id;

-- name: UpdateToeic :one
UPDATE toeic SET score = @score, date_passage = @date_passage, remarque = @remarque, version = version + 1 WHERE id = @id AND version = @version RETURNING version;

-- name: DeleteToeic :exec
DELETE FROM toeic WHERE id = ANY(@ids::int[]);

