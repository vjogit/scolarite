-- Création d'une promotion par gabarit (16 septembre 2026) : la promotion
-- précédente sert de modèle à la suivante. Le serveur copie, dans une seule
-- transaction et dans l'ordre parent → enfant, la structure (options,
-- périodes avec leurs dates, UE, matières) et le contenu syllabus qui s'y
-- attache (description et responsable de l'UE, fiches des matières, blocs,
-- compétences, liaisons UE ↔ compétence). Jamais ce qui appartient aux
-- élèves ou à l'année : groupes, contrôles, notes, jurys, réservations,
-- certifications.
--
-- Chaque table se copie ligne à ligne par INSERT … SELECT … WHERE id =
-- @source : les colonnes sont listées une fois, ici ; le re-mappage des
-- identifiants (ancien parent → nouveau parent) vit dans le Go qui enchaîne
-- ces requêtes. Les lectures passent par les vues actives (invariant 9) :
-- une branche en corbeille ne se copie pas.

-- name: FetchOptionIdsByPromotionID :many
SELECT id FROM public.option_active WHERE promotion_id = @promotion_id ORDER BY id;

-- name: CopierOption :one
INSERT INTO option (name, promotion_id)
SELECT o.name, @promotion_id FROM public.option_active o WHERE o.id = @source
RETURNING id;

-- name: FetchPeriodeIdsByOptionID :many
SELECT id FROM public.periode_active WHERE option_id = @option_id ORDER BY id;

-- name: CopierPeriode :one
INSERT INTO periode (name, debut, fin, option_id)
SELECT pe.name, pe.debut, pe.fin, @option_id FROM public.periode_active pe WHERE pe.id = @source
RETURNING id;

-- name: FetchUeIdsByPeriodeID :many
SELECT id FROM public.unite_enseignement WHERE periode_id = @periode_id ORDER BY id;

-- Les deux colonnes syllabus de l'UE (description, responsable) suivent :
-- la reconduction d'une année à l'autre est le geste réel des rédacteurs.
-- name: CopierUniteEnseignement :one
INSERT INTO unite_enseignement (name, ects, academique, periode_id, description, responsable_id)
SELECT ue.name, ue.ects, ue.academique, @periode_id, ue.description, ue.responsable_id
FROM public.unite_enseignement ue WHERE ue.id = @source
RETURNING id;

-- name: FetchMatiereIdsByUeID :many
SELECT id FROM public.matiere WHERE unite_enseignement_id = @ue_id ORDER BY id;

-- name: CopierMatiere :one
INSERT INTO matiere (name, heure, coeff, color, unite_enseignement_id)
SELECT m.name, m.heure, m.coeff, m.color, @ue_id FROM public.matiere m WHERE m.id = @source
RETURNING id;

-- La fiche syllabus de la matière, si elle existe (0 ou 1 ligne) : rubriques,
-- ventilation et responsable, en version 1 sur la copie.
-- name: CopierSyllabusMatiere :execrows
INSERT INTO syllabus_matiere (
    matiere_id, contexte, objectifs, prerequis, activites, evaluation, plan_cours, ressources, dimension_socio_env,
    heures_cours, heures_cours_td, heures_td, heures_tp, heures_projet, heures_autonomie, heures_controle, heures_perso,
    responsable_id
)
SELECT @matiere_id, s.contexte, s.objectifs, s.prerequis, s.activites, s.evaluation, s.plan_cours, s.ressources, s.dimension_socio_env,
       s.heures_cours, s.heures_cours_td, s.heures_td, s.heures_tp, s.heures_projet, s.heures_autonomie, s.heures_controle, s.heures_perso,
       s.responsable_id
FROM public.syllabus_matiere s WHERE s.matiere_id = @source;

-- name: FetchBlocIdsByPromotionID :many
SELECT id FROM public.bloc_competence WHERE promotion_id = @promotion_id ORDER BY ordre;

-- name: CopierBloc :one
INSERT INTO bloc_competence (promotion_id, ordre, libelle, code, activites, modalites_evaluation)
SELECT @promotion_id, b.ordre, b.libelle, b.code, b.activites, b.modalites_evaluation
FROM public.bloc_competence b WHERE b.id = @source
RETURNING id;

-- name: FetchCompetenceIdsByBlocID :many
SELECT id FROM public.competence WHERE bloc_id = @bloc_id ORDER BY ordre;

-- name: CopierCompetence :one
INSERT INTO competence (bloc_id, ordre, action, contexte, finalites)
SELECT @bloc_id, c.ordre, c.action, c.contexte, c.finalites
FROM public.competence c WHERE c.id = @source
RETURNING id;

-- Les liaisons de l'UE source, à reposer sur la nouvelle UE et les nouvelles
-- compétences : les deux côtés sont re-mappés par l'appelant.
-- name: FetchUeCompetencesByUeID :many
SELECT competence_id, enseignee, mise_en_oeuvre, evaluee
FROM public.ue_competence WHERE ue_id = @ue_id ORDER BY competence_id;

-- name: CopierUeCompetence :exec
INSERT INTO ue_competence (ue_id, competence_id, enseignee, mise_en_oeuvre, evaluee)
VALUES (@ue_id, @competence_id, @enseignee, @mise_en_oeuvre, @evaluee);
