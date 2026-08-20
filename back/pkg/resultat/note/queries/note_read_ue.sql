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
    --
    -- Un rattrapage validé vaut le seuil « E » de la promotion : echelle[5],
    -- le dernier seuil de l'échelle, celui qui sépare E de F. C'est la note
    -- plancher d'une validation. Cette valeur était écrite 8.0 en dur, ce qui
    -- ne valait que pour une promotion notée sur 20 dont l'échelle finit à 8.
    SELECT
        mb.user_id,
        mb.matiere_coeff,
        mb.has_not_evaluated,
        mb.nb_rattrapages_valides > 0 AS est_rattrapee,
        CASE
            WHEN mb.has_not_evaluated          THEN NULL
            WHEN mb.nb_rattrapages_valides > 0 THEN cr.echelle[5]::float
            ELSE mb.moyenne_s1
        END AS moyenne_finale_matiere
    FROM matieres_brutes mb
    CROSS JOIN context_rules cr
),
ue_calc AS (
    -- 4. Calcul de l'UE, propagation N.E., vérification de la règle d'élimination
    --
    -- Le test porte sur `moyenne_finale_matiere IS NULL` et non sur
    -- `has_not_evaluated` : il couvre le N.E. et tout autre cas où la matière
    -- ne produit aucune moyenne — par exemple un rattrapage non validé sans
    -- contrôle normal noté. C'est aussi ce qui rend la moyenne d'UE sûre :
    -- `SUM` écarte les NULL du numérateur mais garde leur coefficient au
    -- dénominateur, si bien qu'une matière sans moyenne diluait le résultat.
    -- Une élève évaluée 16 dans sa seule matière notée s'affichait 5.33.
    -- L'UE ne peut plus être calculée sur un dénominateur incomplet.
    SELECT
        mf.user_id,
        BOOL_OR(mf.moyenne_finale_matiere IS NULL) AS is_not_evaluated,
        BOOL_OR(mf.est_rattrapee)                  AS a_matiere_rattrapee,
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
    -- Une UE non évaluée n'a pas de note : elle ne vaut pas la moyenne de ses
    -- seules matières évaluées. Le grade disait déjà « N.E. » pendant que la
    -- colonne note affichait un nombre — deux verdicts contradictoires sur la
    -- même ligne.
    CASE WHEN uc.is_not_evaluated THEN NULL ELSE uc.moyenne_ue END::my_null_float AS note,
    -- Idem : sans moyenne complète, on ne sait pas si une matière est
    -- éliminatoire. `BOOL_OR` écartait les comparaisons NULL et concluait
    -- « non », ce qui est une affirmation qu'on ne peut pas soutenir.
    CASE WHEN uc.is_not_evaluated THEN NULL ELSE uc.est_elimine END::my_null_bool AS a_matiere_eliminatoire,

    CASE
        WHEN uc.is_not_evaluated                THEN 'N.E.'
        WHEN uc.est_elimine                     THEN 'F'
        WHEN uc.moyenne_ue >= cr.echelle[1]     THEN 'A'
        WHEN uc.moyenne_ue >= cr.echelle[2]     THEN 'B'
        WHEN uc.moyenne_ue >= cr.echelle[3]     THEN 'C'
        WHEN uc.moyenne_ue >= cr.echelle[4]     THEN 'D'
        WHEN uc.moyenne_ue >= cr.echelle[5]     THEN 'E'
        ELSE 'F'
    END AS grade_lettre,

    -- D'où vient la moyenne ci-dessus. Voir note_read_matiere.sql : la colonne
    -- ne calcule rien, elle nomme le calcul. Ici « rattrapage » signifie qu'au
    -- moins une matière de l'UE a été portée au seuil « E » par un rattrapage
    -- validé, et que la moyenne d'UE en hérite — elle ne correspond donc pas
    -- entièrement aux copies rendues.
    CASE
        WHEN uc.is_not_evaluated   THEN 'non_evaluee'
        WHEN uc.a_matiere_rattrapee THEN 'rattrapage'
        ELSE 'moyenne'
    END AS provenance

FROM ue_calc uc
JOIN public."user" u ON uc.user_id = u.id
CROSS JOIN context_rules cr
ORDER BY u."lastName", u."firstName";
