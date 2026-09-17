-- Référentiel de compétences d'une promotion (lot 3, rattaché à la promotion
-- le 16 septembre 2026) : blocs, puis compétences d'un bloc, puis le
-- référentiel à plat pour la matrice de l'UE. Tout est trié par position
-- (`ordre`) : le code « C{ordre} » se calcule à l'affichage. Aucune donnée de
-- structure n'est lue au-delà de l'existence de la promotion (vue active).

-- name: CheckPromotionExists :one
SELECT 1 FROM public.promotion_active WHERE id = @id;

-- name: FetchBlocsByPromotionID :many
SELECT * FROM public.bloc_competence WHERE promotion_id = @promotion_id ORDER BY ordre;

-- name: FetchBlocById :one
SELECT * FROM public.bloc_competence WHERE id = @id;

-- name: FetchBlocNamesByIds :many
SELECT id, libelle AS name FROM public.bloc_competence WHERE id = ANY(@ids::int[]) ORDER BY id;

-- Impact de la suppression de blocs : ce que la cascade emporte.
-- name: BlocDeleteImpact :one
SELECT
    (SELECT count(*) FROM public.competence c WHERE c.bloc_id = ANY(@ids::int[]))::bigint AS competence_count,
    (SELECT count(*) FROM public.ue_competence uc
        JOIN public.competence c ON c.id = uc.competence_id
        WHERE c.bloc_id = ANY(@ids::int[]))::bigint AS ue_competence_count;

-- name: CheckBlocExists :one
SELECT 1 FROM public.bloc_competence WHERE id = @id;

-- name: FetchCompetencesByBlocID :many
SELECT * FROM public.competence WHERE bloc_id = @bloc_id ORDER BY ordre;

-- name: FetchCompetenceById :one
SELECT * FROM public.competence WHERE id = @id;

-- name: CheckCompetenceExists :one
SELECT 1 FROM public.competence WHERE id = @id;

-- name: FetchCompetenceNamesByIds :many
SELECT id, action AS name FROM public.competence WHERE id = ANY(@ids::int[]) ORDER BY id;

-- name: CompetenceDeleteImpact :one
SELECT
    (SELECT count(*) FROM public.ue_competence uc WHERE uc.competence_id = ANY(@ids::int[]))::bigint AS ue_competence_count;

-- Le référentiel à plat d'une promotion, chaque compétence portant son bloc :
-- c'est ce que la matrice de l'UE affiche, en une requête. Un bloc sans
-- compétence n'y figure pas — il n'a aucune ligne à cocher.
-- name: FetchReferentielByPromotionID :many
SELECT c.id, c.version, c.bloc_id, c.ordre, c.action, c.contexte, c.finalites,
       b.ordre AS bloc_ordre, b.libelle AS bloc_libelle, b.code AS bloc_code
FROM public.competence c
JOIN public.bloc_competence b ON b.id = c.bloc_id
WHERE b.promotion_id = @promotion_id
ORDER BY b.ordre, c.ordre;
