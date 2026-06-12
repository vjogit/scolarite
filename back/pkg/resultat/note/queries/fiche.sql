-- name: FetchInformationsFiche :one
SELECT
    f.name,
    EXTRACT(YEAR FROM pe.debut)::int as annee,
    pr.name as promotion,
    COALESCE(u."firstName" || ' ' || u."lastName", 'Non assigné') as responsable,
    m.name as matiere_name,
    ue.name as ue_name,
    c.coeff::text,
    c.name as controle_name,
    c.id as controle_id
FROM public.controle c
JOIN public.matiere m              ON m.id  = c.matiere_id
JOIN public.unite_enseignement ue  ON ue.id = m.unite_enseignement_id
JOIN public.periode pe             ON pe.id = ue.periode_id
JOIN public.option o               ON o.id  = pe.option_id
JOIN public.promotion pr           ON pr.id = o.promotion_id
JOIN public.formation f            ON f.id  = pr.formation_id
LEFT JOIN LATERAL (
    SELECT ri.user_id
    FROM public.reservation r
    JOIN public.reservation_intervenant ri ON ri.reservation_id = r.id
    WHERE r.matiere_id = m.id
    LIMIT 1
) ri ON true
LEFT JOIN public."user" u ON u.id = ri.user_id
WHERE c.id = $1;

-- name: FetchElevesFiche :many
SELECT DISTINCT
    u.id,
    COALESCE(u."lastName", '') as lastName,
    COALESCE(u."firstName", '') as firstName
FROM public."user" u
JOIN public.groupe_user gu        ON gu.user_id   = u.id
JOIN public.groupe g              ON g.id         = gu.groupe_id
JOIN public.option o              ON o.id         = g.option_id
JOIN public.periode pe            ON pe.option_id = o.id
JOIN public.unite_enseignement ue ON ue.periode_id = pe.id
JOIN public.matiere m             ON m.unite_enseignement_id = ue.id
JOIN public.controle c            ON c.matiere_id = m.id
WHERE c.id = @controle_id
  AND g.id = @groupe_id
  AND 'ELEVE' = ANY(u.roles)
ORDER BY 2, 3;
