-- name: GetUeStats :many
WITH context_rules AS (
    -- 1. Récupération des règles de la promotion
    SELECT prom.echelle, prom.matiere_eliminatoire, prom.value_matiere_eliminatoire
    FROM public.unite_enseignement ue
    JOIN public.periode p ON ue.periode_id = p.id
    JOIN public.option o ON p.option_id = o.id
    JOIN public.promotion prom ON o.promotion_id = prom.id
    WHERE ue.id = @unite_enseignement_id LIMIT 1
),
matieres_brutes AS (
    -- 2. Moyennes S1, rattrapages et détection N.E.
    SELECT
        n.user_id,
        m.id AS matiere_id,
        m.coeff AS matiere_coeff,

        (SUM(n.note * c.coeff) FILTER (WHERE c.is_rattrapage = FALSE AND n.not_evaluated = FALSE) /
         NULLIF(SUM(c.coeff) FILTER (WHERE c.is_rattrapage = FALSE AND n.not_evaluated = FALSE), 0))::float AS moyenne_s1,

        COUNT(n.id) FILTER (WHERE c.is_rattrapage = TRUE AND n.is_validated = TRUE) AS nb_rattrapages_valides,

        BOOL_OR(n.not_evaluated) FILTER (WHERE c.is_rattrapage = FALSE) AS has_not_evaluated

    FROM public.note n
    JOIN public.controle c ON n.controle_id = c.id
    JOIN public.matiere m ON c.matiere_id = m.id
    WHERE m.unite_enseignement_id = @unite_enseignement_id
      AND (
          (c.is_rattrapage = FALSE AND (n.note IS NOT NULL OR n.not_evaluated = TRUE)) OR
          (c.is_rattrapage = TRUE AND n.is_validated IS NOT NULL)
      )
    GROUP BY n.user_id, m.id, m.coeff
),
matieres_finales AS (
    -- 3. Application des règles : N.E. > rattrapage > moyenne S1
    SELECT
        user_id,
        matiere_coeff,
        has_not_evaluated,
        CASE
            WHEN has_not_evaluated      THEN NULL
            WHEN nb_rattrapages_valides > 0 THEN 8.0::float
            ELSE moyenne_s1
        END AS moyenne_finale_matiere
    FROM matieres_brutes
),
ue_calc AS (
    -- 4. Calcul de l'UE, propagation N.E., vérification de la règle d'élimination
    SELECT
        mf.user_id,
        BOOL_OR(mf.has_not_evaluated) AS is_not_evaluated,
        (SUM(mf.moyenne_finale_matiere * mf.matiere_coeff) / NULLIF(SUM(mf.matiere_coeff), 0))::float AS moyenne_ue,
        BOOL_OR(
            cr.matiere_eliminatoire IS TRUE
            AND mf.moyenne_finale_matiere < cr.value_matiere_eliminatoire
        ) AS est_elimine
    FROM matieres_finales mf
    CROSS JOIN context_rules cr
    GROUP BY mf.user_id, cr.matiere_eliminatoire, cr.value_matiere_eliminatoire
)
-- 5. Verdict et attribution du Grade
SELECT
    u.id AS user_id,
    u."firstName",
    u."lastName",
    uc.moyenne_ue::my_null_float AS note,
    uc.est_elimine::my_null_bool AS a_matiere_eliminatoire,

    CASE
        WHEN uc.is_not_evaluated                THEN 'N.E.'
        WHEN uc.est_elimine                     THEN 'F'
        WHEN uc.moyenne_ue >= cr.echelle[1]     THEN 'A'
        WHEN uc.moyenne_ue >= cr.echelle[2]     THEN 'B'
        WHEN uc.moyenne_ue >= cr.echelle[3]     THEN 'C'
        WHEN uc.moyenne_ue >= cr.echelle[4]     THEN 'D'
        WHEN uc.moyenne_ue >= cr.echelle[5]     THEN 'E'
        ELSE 'F'
    END AS grade_lettre

FROM ue_calc uc
JOIN public."user" u ON uc.user_id = u.id
CROSS JOIN context_rules cr
ORDER BY u."lastName", u."firstName";
