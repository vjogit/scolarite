-- name: FetchNotesByPeriodeID :many

WITH context_rules AS (
    -- Étape 0 : Règles globales de la promotion pour cette période
    SELECT
        prom.matiere_eliminatoire,
        prom.value_matiere_eliminatoire,
        prom.echelle_gpa,
        prom.echelle
    FROM public.periode p
    JOIN public.option o ON p.option_id = o.id
    JOIN public.promotion prom ON o.promotion_id = prom.id
    WHERE p.id = @periode_id
    LIMIT 1
),
matieres_brutes AS (
    -- Étape 1 : Calcul des moyennes S1, rattrapages et détection N.E.
    SELECT
        n.user_id,
        m.unite_enseignement_id,
        m.id AS matiere_id,
        m.coeff AS matiere_coeff,

        -- Moyenne Session 1, hors notes non évaluées
        (SUM(n.note * c.coeff) FILTER (WHERE c.is_rattrapage = FALSE AND n.not_evaluated = FALSE) /
         NULLIF(SUM(c.coeff) FILTER (WHERE c.is_rattrapage = FALSE AND n.not_evaluated = FALSE), 0))::float AS moyenne_s1,

        -- Comptage des rattrapages validés
        COUNT(n.id) FILTER (WHERE c.is_rattrapage = TRUE AND n.is_validated = TRUE) AS nb_rattrapages_valides,

        -- Détection d'au moins une note non évaluée sur les contrôles normaux
        BOOL_OR(n.not_evaluated) FILTER (WHERE c.is_rattrapage = FALSE) AS has_not_evaluated

    FROM public.note n
    JOIN public.controle c ON n.controle_id = c.id
    JOIN public.matiere m ON c.matiere_id = m.id
    JOIN public.unite_enseignement ue ON m.unite_enseignement_id = ue.id
    WHERE ue.periode_id = @periode_id
      AND (
          (c.is_rattrapage = FALSE AND (n.note IS NOT NULL OR n.not_evaluated = TRUE)) OR
          (c.is_rattrapage = TRUE AND n.is_validated IS NOT NULL)
      )
    GROUP BY n.user_id, m.unite_enseignement_id, m.id, m.coeff
),
matieres_finales AS (
    -- Étape 2 : Application des règles : N.E. > rattrapage > moyenne S1
    SELECT
        user_id,
        unite_enseignement_id,
        matiere_coeff,
        has_not_evaluated,
        CASE
            WHEN has_not_evaluated          THEN NULL
            WHEN nb_rattrapages_valides > 0 THEN 8.0::float
            ELSE moyenne_s1
        END AS moyenne_finale_matiere
    FROM matieres_brutes
),
ues_calc AS (
    -- Étape 3 : Calcul de la moyenne de chaque UE, propagation N.E., détection éliminatoire
    SELECT
        mf.user_id,
        mf.unite_enseignement_id,
        ue.ects,
        BOOL_OR(mf.has_not_evaluated) AS is_not_evaluated,
        (SUM(mf.moyenne_finale_matiere * mf.matiere_coeff) / NULLIF(SUM(mf.matiere_coeff), 0))::float AS moyenne_ue,
        BOOL_OR(
            cr.matiere_eliminatoire IS TRUE
            AND mf.moyenne_finale_matiere < cr.value_matiere_eliminatoire
        ) AS est_elimine,
        cr.echelle
    FROM matieres_finales mf
    JOIN public.unite_enseignement ue ON mf.unite_enseignement_id = ue.id
    CROSS JOIN context_rules cr
    GROUP BY mf.user_id, mf.unite_enseignement_id, ue.ects, cr.echelle, cr.matiere_eliminatoire, cr.value_matiere_eliminatoire
),
ues_with_gpa_points AS (
    -- Étape 4 : Conversion Note UE -> gpa_index (NULL si N.E., exclu du GPA)
    SELECT
        uc.user_id,
        uc.ects,
        CASE
            WHEN uc.is_not_evaluated        THEN NULL  -- N.E. : exclu du GPA
            WHEN uc.est_elimine             THEN 0
            WHEN uc.moyenne_ue >= uc.echelle[1] THEN 1
            WHEN uc.moyenne_ue >= uc.echelle[2] THEN 2
            WHEN uc.moyenne_ue >= uc.echelle[3] THEN 3
            WHEN uc.moyenne_ue >= uc.echelle[4] THEN 4
            WHEN uc.moyenne_ue >= uc.echelle[5] THEN 5
            ELSE 0
        END AS gpa_index
    FROM ues_calc uc
),
gpa_aggregation AS (
    -- Étape 5 : Calcul final du GPA pondéré par les ECTS (N.E. exclus du dénominateur)
    SELECT
        ug.user_id,
        (
            SUM(
                CASE
                    WHEN ug.gpa_index IS NULL THEN 0
                    WHEN ug.gpa_index = 0     THEN 0
                    ELSE cr.echelle_gpa[ug.gpa_index]
                END * ug.ects
            )
            / NULLIF(SUM(ug.ects) FILTER (WHERE ug.gpa_index IS NOT NULL), 0)
        )::float AS gpa_periode
    FROM ues_with_gpa_points ug
    CROSS JOIN context_rules cr
    GROUP BY ug.user_id
)
-- Étape 6 : Affichage final
SELECT
    u.id AS user_id,
    u."firstName",
    u."lastName",
    ga.gpa_periode::my_null_float AS note
FROM gpa_aggregation ga
JOIN public."user" u ON ga.user_id = u.id
ORDER BY ga.gpa_periode DESC, u."lastName";
