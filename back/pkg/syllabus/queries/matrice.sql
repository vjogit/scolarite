-- La matrice de l'UE (lot 3) : les compétences que l'UE adresse, avec leurs
-- trois axes. Lecture ordonnée par bloc puis compétence ; écriture par
-- remplacement intégral dans une transaction (DELETE puis INSERT … SELECT),
-- sans verrou — dernier écrit gagne, choix utilisateur.

-- name: FetchUeCompetences :many
SELECT uc.*
FROM public.ue_competence uc
JOIN public.competence c ON c.id = uc.competence_id
JOIN public.bloc_competence b ON b.id = c.bloc_id
WHERE uc.ue_id = @ue_id
ORDER BY b.ordre, c.ordre;

-- name: DeleteUeCompetences :exec
DELETE FROM ue_competence WHERE ue_id = @ue_id;

-- Une compétence ne se lie à une UE que si son bloc appartient à la promotion
-- de l'UE. La chaîne réelle du schéma — UE → période → option → promotion,
-- par les vues actives (invariant 9) — est jointe ici : la requête ne peut
-- physiquement insérer qu'une compétence de la bonne promotion. Zéro ligne
-- insérée = compétence inconnue ou hors promotion ; c'est le handler qui
-- distingue les deux et annule la transaction.
-- name: InsertUeCompetence :execrows
INSERT INTO ue_competence (ue_id, competence_id, enseignee, mise_en_oeuvre, evaluee)
SELECT ue.id, c.id, @enseignee, @mise_en_oeuvre, @evaluee
FROM public.unite_enseignement ue
JOIN public.periode_active pe ON pe.id = ue.periode_id
JOIN public.option_active o ON o.id = pe.option_id
JOIN public.promotion_active p ON p.id = o.promotion_id
JOIN public.bloc_competence b ON b.promotion_id = p.id
JOIN public.competence c ON c.bloc_id = b.id
WHERE ue.id = @ue_id AND c.id = @competence_id;
