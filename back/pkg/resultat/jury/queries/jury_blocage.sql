-- Périodes délibérées qu'une suppression atteindrait — l'unique définition
-- de « couvert par un jury délibéré » (lot correction-blocage-jury, 17
-- septembre 2026) : une période active portant au moins un résultat de jury.
-- Le périmètre nomme le type des identifiants fournis ; la requête remonte
-- (option, promotion, formation) ou descend (UE, matière, contrôle) jusqu'aux
-- périodes actives que la cascade toucherait, par les vues actives comme les
-- analyses d'impact. Compte = périodes distinctes, c'est ce que le message
-- `blocage.jury_delibere` annonce, quel que soit le point d'entrée.
-- name: CountPeriodesDeliberees :one
WITH periode_c AS (
    SELECT pe.id FROM public.periode_active pe
    WHERE (@perimetre::text = 'periode' AND pe.id = ANY(@ids::int[]))
       OR (@perimetre::text = 'option' AND pe.option_id = ANY(@ids::int[]))
       OR (@perimetre::text = 'promotion' AND pe.option_id IN (
               SELECT o.id FROM public.option_active o WHERE o.promotion_id = ANY(@ids::int[])))
       OR (@perimetre::text = 'formation' AND pe.option_id IN (
               SELECT o.id FROM public.option_active o WHERE o.promotion_id IN (
                   SELECT p.id FROM public.promotion_active p WHERE p.formation_id = ANY(@ids::int[]))))
       OR (@perimetre::text = 'unite_enseignement' AND pe.id IN (
               SELECT ue.periode_id FROM public.unite_enseignement ue WHERE ue.id = ANY(@ids::int[])))
       OR (@perimetre::text = 'matiere' AND pe.id IN (
               SELECT ue.periode_id FROM public.matiere m
               JOIN public.unite_enseignement ue ON ue.id = m.unite_enseignement_id
               WHERE m.id = ANY(@ids::int[])))
       OR (@perimetre::text = 'controle' AND pe.id IN (
               SELECT ue.periode_id FROM public.controle ct
               JOIN public.matiere m ON m.id = ct.matiere_id
               JOIN public.unite_enseignement ue ON ue.id = m.unite_enseignement_id
               WHERE ct.id = ANY(@ids::int[])))
)
SELECT count(*)::bigint FROM periode_c pe
WHERE EXISTS (SELECT 1 FROM public.jury_result jr WHERE jr.periode_id = pe.id);
