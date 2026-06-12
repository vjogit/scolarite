-- name: FetchNotesByMatiereID :many
WITH notes_groupees AS (
    SELECT
        u.id AS user_id,
        u."firstName",
        u."lastName",
        m.id AS matiere_id,
        m.name AS matiere_name,

        -- 1. Calcul de la moyenne normale (Session 1), hors notes non évaluées
        (SUM(n.note * c.coeff) FILTER (WHERE c.is_rattrapage = FALSE AND n.not_evaluated = FALSE) /
         NULLIF(SUM(c.coeff) FILTER (WHERE c.is_rattrapage = FALSE AND n.not_evaluated = FALSE), 0))::float AS moyenne_s1,

        -- 2. Comptage des rattrapages validés (Session 2)
        COUNT(n.id) FILTER (WHERE c.is_rattrapage = TRUE AND n.is_validated = TRUE) AS nb_rattrapages_valides,

        -- 3. Détection d'au moins une note non évaluée sur les contrôles normaux
        BOOL_OR(n.not_evaluated) FILTER (WHERE c.is_rattrapage = FALSE) AS has_not_evaluated

    FROM public."user" u
    JOIN public.note n ON u.id = n.user_id
    JOIN public.controle c ON n.controle_id = c.id
    JOIN public.matiere m ON c.matiere_id = m.id
    WHERE m.id = @matiere_id
      AND (
          (c.is_rattrapage = FALSE AND (n.note IS NOT NULL OR n.not_evaluated = TRUE)) OR
          (c.is_rattrapage = TRUE AND n.is_validated IS NOT NULL)
      )
    GROUP BY u.id, u."firstName", u."lastName", m.id, m.name
)
SELECT
    user_id,
    "firstName",
    "lastName",
    matiere_id,
    matiere_name,

    -- 4. Application des règles métier :
    --    - N.E. si au moins un contrôle non évalué
    --    - 8 si un rattrapage est validé
    --    - sinon la moyenne S1
    CASE
        WHEN has_not_evaluated      THEN NULL::my_null_float
        WHEN nb_rattrapages_valides > 0 THEN 8.0::my_null_float
        ELSE moyenne_s1::my_null_float
    END AS note

FROM notes_groupees
ORDER BY "lastName", "firstName";
