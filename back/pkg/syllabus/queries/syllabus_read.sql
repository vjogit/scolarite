-- name: FetchSyllabusMatiereByMatiereID :one
SELECT * FROM public.syllabus_matiere WHERE matiere_id = @matiere_id;

-- name: CheckMatiereExists :one
SELECT 1 FROM public.matiere WHERE id = @id;

-- name: FetchUniteEnseignementById :one
SELECT * FROM public.unite_enseignement WHERE id = @id;

-- Les fiches des matières d'une UE, pour la fiche PDF (lot 5) : les
-- identifiants viennent du repository des matières (structure), la requête
-- ne joint rien — une matière sans fiche n'a pas de ligne, le gabarit la
-- rend comme une fiche vide. Ordre stable sur matiere_id, l'appelant
-- réordonne sur celui de la structure.
-- name: FetchSyllabusMatieresByMatiereIDs :many
SELECT * FROM public.syllabus_matiere WHERE matiere_id = ANY(@ids::int[]) ORDER BY matiere_id;
