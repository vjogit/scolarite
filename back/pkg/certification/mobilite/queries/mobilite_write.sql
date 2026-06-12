-- name: CreateMobilite :one
INSERT INTO public.mobilite_internationale (user_id, pays, ville, type_mobilite, date_debut, date_fin, est_valide, remarque, promotion_id)
    VALUES (@user_id, @pays, @ville, @type_mobilite, @date_debut, @date_fin, @est_valide, @remarque, @promotion_id)
    RETURNING id;

-- name: UpdateMobilite :one
UPDATE public.mobilite_internationale
SET pays = @pays,
    ville = @ville,
    type_mobilite = @type_mobilite,
    date_debut = @date_debut,
    date_fin = @date_fin,
    est_valide = @est_valide,
    remarque = @remarque,
    version = version + 1
WHERE id = @id AND version = @version
RETURNING version;

-- name: DeleteMobilite :exec
DELETE FROM public.mobilite_internationale WHERE id = ANY(@ids::int[]);
