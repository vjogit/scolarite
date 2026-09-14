-- Fiche 1-1 avec la matière : l'écriture est un upsert. Sans ligne, insertion
-- en version 1 ; avec une ligne, mise à jour sous verrou optimiste (la version
-- reçue doit être celle en base). Un WHERE faux sur le DO UPDATE ne renvoie
-- aucune ligne : le handler y lit le conflit de version (409).
-- Aucune donnée de structure n'est lue ni recopiée ici (matiere.heure fait foi,
-- l'écart avec la ventilation se signale à l'affichage, jamais en base).
-- name: UpsertSyllabusMatiere :one
INSERT INTO syllabus_matiere (
    matiere_id, contexte, objectifs, prerequis, activites, evaluation, plan_cours, ressources, dimension_socio_env,
    heures_cours, heures_cours_td, heures_td, heures_tp, heures_projet, heures_autonomie, heures_controle, heures_perso,
    responsable_id
) VALUES (
    @matiere_id, @contexte, @objectifs, @prerequis, @activites, @evaluation, @plan_cours, @ressources, @dimension_socio_env,
    @heures_cours, @heures_cours_td, @heures_td, @heures_tp, @heures_projet, @heures_autonomie, @heures_controle, @heures_perso,
    @responsable_id
)
ON CONFLICT (matiere_id) DO UPDATE SET
    contexte = EXCLUDED.contexte,
    objectifs = EXCLUDED.objectifs,
    prerequis = EXCLUDED.prerequis,
    activites = EXCLUDED.activites,
    evaluation = EXCLUDED.evaluation,
    plan_cours = EXCLUDED.plan_cours,
    ressources = EXCLUDED.ressources,
    dimension_socio_env = EXCLUDED.dimension_socio_env,
    heures_cours = EXCLUDED.heures_cours,
    heures_cours_td = EXCLUDED.heures_cours_td,
    heures_td = EXCLUDED.heures_td,
    heures_tp = EXCLUDED.heures_tp,
    heures_projet = EXCLUDED.heures_projet,
    heures_autonomie = EXCLUDED.heures_autonomie,
    heures_controle = EXCLUDED.heures_controle,
    heures_perso = EXCLUDED.heures_perso,
    responsable_id = EXCLUDED.responsable_id,
    version = syllabus_matiere.version + 1
WHERE syllabus_matiere.version = @version
RETURNING *;

-- Les deux colonnes syllabus de l'UE, et rien d'autre : name, ects, academique
-- restent à UpdateUniteEnseignement (domaine STRUCTURE), qui de son côté ne
-- nomme pas ces colonnes. RETURNING * pour que la réponse soit l'UE complète.
-- name: UpdateUniteEnseignementSyllabus :one
UPDATE unite_enseignement
SET description = @description, responsable_id = @responsable_id, version = version + 1
WHERE id = @id AND version = @version
RETURNING *;
