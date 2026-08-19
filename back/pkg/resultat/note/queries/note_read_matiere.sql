-- name: FetchNotesByMatiereID :many
WITH context_rules AS (
    -- Règles de la promotion dont dépend la matière. Seul echelle est utilisé
    -- ici, pour le seuil « E » attribué à un rattrapage validé.
    SELECT prom.echelle
    FROM public.matiere m
    JOIN public.unite_enseignement ue ON ue.id   = m.unite_enseignement_id
    JOIN public.periode p             ON p.id    = ue.periode_id
    JOIN public.option o              ON o.id    = p.option_id
    JOIN public.promotion prom        ON prom.id = o.promotion_id
    WHERE m.id = @matiere_id
    LIMIT 1
),
notes_groupees AS (
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
    ng.user_id,
    ng."firstName",
    ng."lastName",
    ng.matiere_id,
    ng.matiere_name,

    -- 4. Application des règles métier :
    --    - N.E. si au moins un contrôle non évalué
    --    - le seuil « E » de la promotion si un rattrapage est validé
    --    - sinon la moyenne S1
    --
    -- echelle[5] est le dernier seuil de l'échelle, celui qui sépare E de F :
    -- la note plancher d'une validation. Cette valeur était écrite 8.0 en dur,
    -- ce qui ne valait que pour une promotion notée sur 20 dont l'échelle
    -- finit à 8.
    CASE
        WHEN ng.has_not_evaluated          THEN NULL::my_null_float
        WHEN ng.nb_rattrapages_valides > 0 THEN cr.echelle[5]::my_null_float
        ELSE ng.moyenne_s1::my_null_float
    END AS note

FROM notes_groupees ng
CROSS JOIN context_rules cr
ORDER BY "lastName", "firstName";
