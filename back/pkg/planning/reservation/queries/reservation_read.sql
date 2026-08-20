-- name: FetchHeuresByPeriode :many
SELECT
    m.id                AS matiere_id,
    m.name              AS matiere_name,
    ue.name             AS ue_name,
    m.heure             AS heures_prevues,
    COALESCE(
        SUM(EXTRACT(EPOCH FROM (upper(res.horaire) - lower(res.horaire))) / 3600.0),
        0
    )::real             AS heures_consommees
FROM matiere m
JOIN unite_enseignement ue ON ue.id = m.unite_enseignement_id
JOIN periode_active pa ON pa.id = ue.periode_id
LEFT JOIN reservation res ON res.matiere_id = m.id AND res.periode_id = @periode_id
WHERE ue.periode_id = @periode_id
GROUP BY m.id, m.name, ue.name, m.heure
UNION ALL
SELECT
    0::integer          AS matiere_id,
    ''                  AS matiere_name,
    ''                  AS ue_name,
    0::real             AS heures_prevues,
    COALESCE(
        SUM(EXTRACT(EPOCH FROM (upper(horaire) - lower(horaire))) / 3600.0),
        0
    )::real             AS heures_consommees
FROM reservation
JOIN periode_active pa ON pa.id = reservation.periode_id
WHERE periode_id = @periode_id
  AND matiere_id IS NULL
ORDER BY ue_name, matiere_name;

-- name: FetchReservationByID :one
SELECT
    r.id,
    r.version,
    r.horaire,
    r.periode_id,
    r.matiere_id,
    m.name  AS matiere_name,
    m.color AS matiere_color,
    r.type_cours,
    r.is_distanciel,
    r.description,
    json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'batiment', s.batiment))
        FILTER (WHERE s.id IS NOT NULL) AS salles,
    json_agg(DISTINCT jsonb_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName"))
        FILTER (WHERE u.id IS NOT NULL) AS intervenants,
    json_agg(DISTINCT jsonb_build_object('id', g.id, 'name', g.name, 'option_id', g.option_id))
        FILTER (WHERE g.id IS NOT NULL) AS groupes
FROM reservation r
JOIN periode_active pa ON pa.id = r.periode_id
LEFT JOIN public.matiere m ON m.id = r.matiere_id
LEFT JOIN reservation_salle       rs ON rs.reservation_id = r.id
LEFT JOIN salle                   s  ON s.id              = rs.salle_id
LEFT JOIN reservation_intervenant ri ON ri.reservation_id = r.id
LEFT JOIN "user"                  u  ON u.id              = ri.user_id
LEFT JOIN reservation_groupe      rg ON rg.reservation_id = r.id
LEFT JOIN groupe                  g  ON g.id              = rg.groupe_id
WHERE r.id = @id
GROUP BY r.id, m.name, m.color;

-- name: FetchReservationsByPeriode :many
SELECT
    r.id,
    r.version,
    r.horaire,
    r.periode_id,
    r.matiere_id,
    m.name  AS matiere_name,
    m.color AS matiere_color,
    r.type_cours,
    r.is_distanciel,
    r.description,
    json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'batiment', s.batiment))
        FILTER (WHERE s.id IS NOT NULL) AS salles,
    json_agg(DISTINCT jsonb_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName"))
        FILTER (WHERE u.id IS NOT NULL) AS intervenants,
    json_agg(DISTINCT jsonb_build_object('id', g.id, 'name', g.name, 'option_id', g.option_id))
        FILTER (WHERE g.id IS NOT NULL) AS groupes
FROM reservation r
JOIN periode_active pa ON pa.id = r.periode_id
LEFT JOIN public.matiere m ON m.id = r.matiere_id
LEFT JOIN reservation_salle       rs ON rs.reservation_id = r.id
LEFT JOIN salle                   s  ON s.id              = rs.salle_id
LEFT JOIN reservation_intervenant ri ON ri.reservation_id = r.id
LEFT JOIN "user"                  u  ON u.id              = ri.user_id
LEFT JOIN reservation_groupe      rg ON rg.reservation_id = r.id
LEFT JOIN groupe                  g  ON g.id              = rg.groupe_id
WHERE r.periode_id = @periode_id
GROUP BY r.id, m.name, m.color
ORDER BY lower(r.horaire);

-- name: FetchReservationsByGroupe :many
SELECT
    r.id,
    r.version,
    r.horaire,
    r.periode_id,
    r.matiere_id,
    r.type_cours,
    r.is_distanciel,
    r.description,
    json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'batiment', s.batiment))
        FILTER (WHERE s.id IS NOT NULL) AS salles,
    json_agg(DISTINCT jsonb_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName"))
        FILTER (WHERE u.id IS NOT NULL) AS intervenants
FROM reservation r
JOIN periode_active pa ON pa.id = r.periode_id
JOIN reservation_groupe           rg ON rg.reservation_id = r.id
LEFT JOIN reservation_salle       rs ON rs.reservation_id = r.id
LEFT JOIN salle                   s  ON s.id              = rs.salle_id
LEFT JOIN reservation_intervenant ri ON ri.reservation_id = r.id
LEFT JOIN "user"                  u  ON u.id              = ri.user_id
WHERE rg.groupe_id = @groupe_id
  AND r.periode_id = @periode_id
GROUP BY r.id
ORDER BY lower(r.horaire);

-- name: FetchReservationsByIntervenant :many
SELECT
    r.id,
    r.version,
    r.horaire,
    r.periode_id,
    r.matiere_id,
    r.type_cours,
    r.is_distanciel,
    r.description,
    json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'batiment', s.batiment))
        FILTER (WHERE s.id IS NOT NULL) AS salles,
    json_agg(DISTINCT jsonb_build_object('id', g.id, 'name', g.name))
        FILTER (WHERE g.id IS NOT NULL) AS groupes
FROM reservation r
JOIN periode_active pa ON pa.id = r.periode_id
JOIN reservation_intervenant      ri ON ri.reservation_id = r.id
LEFT JOIN reservation_salle       rs ON rs.reservation_id = r.id
LEFT JOIN salle                   s  ON s.id              = rs.salle_id
LEFT JOIN reservation_groupe      rg ON rg.reservation_id = r.id
LEFT JOIN groupe                  g  ON g.id              = rg.groupe_id
WHERE ri.user_id   = @user_id
  AND r.periode_id = @periode_id
GROUP BY r.id
ORDER BY lower(r.horaire);