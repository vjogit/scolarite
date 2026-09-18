-- Traduction du contenu (lot 6). Le français fait référence : la source se lit
-- par les vues « source » (textes + empreinte, changeset 006), la traduction
-- par sa table. La péremption — empreinte_source ≠ empreinte de la source
-- courante — se juge chez l'appelant, à partir de ces deux lectures ; personne
-- ne recalcule l'empreinte hors de la base.

-- name: FetchSourceMatiere :one
SELECT * FROM syllabus_matiere_source WHERE matiere_id = @matiere_id;

-- name: FetchSourcesMatieresByMatiereIDs :many
SELECT * FROM syllabus_matiere_source WHERE matiere_id = ANY(@ids::int[]) ORDER BY matiere_id;

-- name: FetchTraductionMatiere :one
SELECT * FROM syllabus_matiere_traduction WHERE matiere_id = @matiere_id AND langue = @langue;

-- name: FetchTraductionsMatieresByMatiereIDs :many
SELECT * FROM syllabus_matiere_traduction WHERE matiere_id = ANY(@ids::int[]) AND langue = @langue ORDER BY matiere_id;

-- name: FetchSourceUe :one
SELECT * FROM unite_enseignement_source WHERE ue_id = @ue_id;

-- name: FetchSourcesUeByIDs :many
SELECT * FROM unite_enseignement_source WHERE ue_id = ANY(@ids::int[]) ORDER BY ue_id;

-- name: FetchTraductionUe :one
SELECT * FROM unite_enseignement_traduction WHERE ue_id = @ue_id AND langue = @langue;

-- name: FetchTraductionsUeByIDs :many
SELECT * FROM unite_enseignement_traduction WHERE ue_id = ANY(@ids::int[]) AND langue = @langue ORDER BY ue_id;

-- Écriture d'une traduction : upsert sous verrou optimiste, comme la fiche.
-- version_source et empreinte_source sont celles de la source que l'auteur de
-- la traduction a LUE (le rédacteur à l'écran, le CLI au moment de traduire) :
-- une source modifiée entre-temps donne une traduction périmée dès sa
-- naissance, ce qui est exact. modele ne s'écrit que par une traduction
-- automatique ; une relecture (modele nul) garde le dernier traducteur passé.
-- name: UpsertTraductionMatiere :one
INSERT INTO syllabus_matiere_traduction AS t (
    matiere_id, langue, contexte, objectifs, prerequis, activites, evaluation, plan_cours, ressources, dimension_socio_env,
    version_source, empreinte_source, statut, modele
) VALUES (
    @matiere_id, @langue, @contexte, @objectifs, @prerequis, @activites, @evaluation, @plan_cours, @ressources, @dimension_socio_env,
    @version_source, @empreinte_source, @statut, sqlc.narg(modele)
)
ON CONFLICT (matiere_id, langue) DO UPDATE SET
    contexte = EXCLUDED.contexte,
    objectifs = EXCLUDED.objectifs,
    prerequis = EXCLUDED.prerequis,
    activites = EXCLUDED.activites,
    evaluation = EXCLUDED.evaluation,
    plan_cours = EXCLUDED.plan_cours,
    ressources = EXCLUDED.ressources,
    dimension_socio_env = EXCLUDED.dimension_socio_env,
    version_source = EXCLUDED.version_source,
    empreinte_source = EXCLUDED.empreinte_source,
    statut = EXCLUDED.statut,
    modele = COALESCE(EXCLUDED.modele, t.modele),
    traduit_le = now(),
    version = t.version + 1
WHERE t.version = @version
RETURNING *;

-- name: UpsertTraductionUe :one
INSERT INTO unite_enseignement_traduction AS t (
    ue_id, langue, description,
    version_source, empreinte_source, statut, modele
) VALUES (
    @ue_id, @langue, @description,
    @version_source, @empreinte_source, @statut, sqlc.narg(modele)
)
ON CONFLICT (ue_id, langue) DO UPDATE SET
    description = EXCLUDED.description,
    version_source = EXCLUDED.version_source,
    empreinte_source = EXCLUDED.empreinte_source,
    statut = EXCLUDED.statut,
    modele = COALESCE(EXCLUDED.modele, t.modele),
    traduit_le = now(),
    version = t.version + 1
WHERE t.version = @version
RETURNING *;
