-- name: FetchSyllabusMatiereByMatiereID :one
SELECT * FROM public.syllabus_matiere WHERE matiere_id = @matiere_id;

-- name: CheckMatiereExists :one
SELECT 1 FROM public.matiere WHERE id = @id;

-- name: FetchUniteEnseignementById :one
SELECT * FROM public.unite_enseignement WHERE id = @id;
