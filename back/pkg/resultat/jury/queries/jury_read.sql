-- name: FetchUniteEnseignementsByPeriodeID :many
SELECT * FROM public.unite_enseignement
WHERE periode_id = @periode_id order by name ;


-- name: FetchPeriodeById :one
SELECT * FROM periode_active WHERE id = @id;


-- name: Get_gpa_ues_by_periode_v5 :many
SELECT
    user_id                    ::integer,
    first_name                 ::my_null_string,
    last_name                  ::my_null_string,
    gpa_periode                ::my_null_float,
    gpa_academique_periode     ::my_null_float,
    total_ects_valides         ::my_null_float,
    total_ects_periode         ::my_null_float,
    gpa_cumule                 ::my_null_float,
    total_ects_valides_cumule  ::my_null_float,
    total_ects_cumule          ::my_null_float,
    unite_enseignement_id      ::integer,
    moyenne_ue                 ::my_null_float,
    grade_lettre               ::my_null_string,
    ects_ue                    ::my_null_float
FROM get_gpa_ues_by_periode_v5(@periode_id);

-- name: FetchToeicScoresByPeriodeID :many
SELECT t.user_id::integer, MAX(t.score)::integer AS score
FROM public.toeic t
WHERE t.promotion_id = (
    SELECT o.promotion_id
    FROM public.periode_active p
    JOIN public.option_active o ON p.option_id = o.id
    WHERE p.id = @periode_id
)
GROUP BY t.user_id;

-- name: FetchMobiliteValiditeByPeriodeID :many
SELECT m.user_id::integer, BOOL_OR(m.est_valide)::boolean AS est_valide
FROM public.mobilite_internationale m
WHERE m.promotion_id = (
    SELECT o.promotion_id
    FROM public.periode_active p
    JOIN public.option_active o ON p.option_id = o.id
    WHERE p.id = @periode_id
)
GROUP BY m.user_id;

-- name: FetchMatieresByPeriodeID :many
SELECT
    m.unite_enseignement_id::integer AS ue_id,
    m.name::text                     AS matiere_nom
FROM public.periode_active p
JOIN public.unite_enseignement ue ON ue.periode_id           = p.id
JOIN public.matiere m             ON m.unite_enseignement_id = ue.id
WHERE p.id = @periode_id
ORDER BY ue.name, m.name;

-- name: FetchMatieresNonEvaluesByPeriodeID :many
SELECT
    u.id::integer          AS user_id,
    u."firstName"::text    AS first_name,
    u."lastName"::text     AS last_name,
    ue.name::text          AS ue_nom,
    m.name::text           AS matiere_nom
FROM public.periode_active p
JOIN public.unite_enseignement ue ON ue.periode_id           = p.id
JOIN public.matiere m             ON m.unite_enseignement_id = ue.id
JOIN public.controle c            ON c.matiere_id            = m.id
                                 AND c.is_rattrapage         = FALSE
JOIN public.note n                ON n.controle_id           = c.id
                                 AND n.not_evaluated         = TRUE
JOIN public."user" u              ON u.id                    = n.user_id
WHERE p.id = @periode_id
GROUP BY u.id, u."firstName", u."lastName", ue.name, m.name
ORDER BY u."lastName", u."firstName", ue.name, m.name;

-- name: FetchRattrapagesNonValidesByPeriodeID :many
SELECT
    u.id::integer          AS user_id,
    u."firstName"::text    AS first_name,
    u."lastName"::text     AS last_name,
    ue.name::text          AS ue_nom,
    m.name::text           AS matiere_nom
FROM public.periode_active p
JOIN public.option_active o              ON p.option_id             = o.id
JOIN public.unite_enseignement ue ON ue.periode_id           = p.id
JOIN public.matiere m             ON m.unite_enseignement_id = ue.id
JOIN public.controle c            ON c.matiere_id            = m.id
                                 AND c.is_rattrapage         = TRUE
JOIN public.note n                ON n.controle_id           = c.id
                                 AND n.is_validated          = FALSE
JOIN public."user" u              ON u.id                    = n.user_id
WHERE p.id = @periode_id
ORDER BY u."lastName", u."firstName", ue.name, m.name;
