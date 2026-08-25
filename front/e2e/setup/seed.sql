-- Jeu de données de la suite Playwright (front/e2e).
--
-- Idempotent par construction : tout objet créé ici porte le préfixe
-- « E2E » (formation/promotion, noms uniques en base) ou le domaine
-- e2e-*@scolarite.local (élèves) — la purge en tête de script ne supprime
-- donc que ce que ce script a lui-même posé, jamais la hiérarchie
-- manuellement vérifiée qui vit à côté (voir la mémoire
-- jeu-donnees-verif-hierarchie). Deux exécutions consécutives laissent l'état
-- final identique : c'est la preuve attendue en étape 4.
--
-- Une branche dédiée plutôt que la réutilisation de données existantes : un
-- aller-retour Excel a déjà détruit un jeu de données partagé par le passé.

begin;

-- ── Purge ────────────────────────────────────────────────────────────────
-- Les CASCADE du schéma (formation → promotion → option → périodes/groupes →
-- UE → matières → contrôles → notes ; périodes/UE → jury_result ; groupes →
-- groupe_user) emportent tout le reste depuis la formation. Les élèves n'ont
-- pas de lien vers la formation : purge séparée par domaine de courriel.
delete from formation where name = 'E2E Formation';
delete from "user" where email like 'e2e-%@scolarite.local';

-- ── Hiérarchie principale : Structure → Notes → Jury → Programme ──────────
with f as (
    insert into formation (name) values ('E2E Formation') returning id
), p as (
    insert into promotion (name, debut, fin, echelle_gpa, echelle, matiere_eliminatoire, value_matiere_eliminatoire, formation_id, bareme)
    select 'E2E Promotion', '2025-09-01', '2026-08-31',
           array[4, 3.5, 3, 2.5, 2, 0]::real[], array[16, 14, 12, 10, 8]::real[],
           true, 6, f.id, 20
    from f
    returning id
), o as (
    insert into option (name, promotion_id) select 'E2E Option', p.id from p returning id
), pe as (
    insert into periode (name, debut, fin, option_id)
    select 'E2E Periode', '2025-09-01', '2026-01-31', o.id from o
    returning id
), ue as (
    insert into unite_enseignement (name, ects, academique, periode_id)
    select 'E2E UE1', 5, true, pe.id from pe
    returning id
), mat as (
    insert into matiere (name, heure, coeff, unite_enseignement_id)
    select 'E2E Matiere', 20, 1, ue.id from ue
    returning id
), ctrl_continu as (
    insert into controle (name, coeff, is_rattrapage, matiere_id)
    select 'E2E Controle Continu', 2, false, mat.id from mat
    returning id
), ctrl_rattrapage as (
    insert into controle (name, coeff, is_rattrapage, matiere_id)
    select 'E2E Controle Rattrapage', 5, true, mat.id from mat
    returning id
), gr as (
    insert into groupe (name, option_id) select 'E2E Groupe', o.id from o returning id
), eleves as (
    insert into "user" ("firstName", "lastName", email, type_personne)
    values
        ('E2E', 'Eleve1', 'e2e-eleve1@scolarite.local', 'ELEVE'),
        ('E2E', 'Eleve2', 'e2e-eleve2@scolarite.local', 'ELEVE'),
        ('E2E', 'Eleve3', 'e2e-eleve3@scolarite.local', 'ELEVE'),
        ('E2E', 'Eleve4', 'e2e-eleve4@scolarite.local', 'ELEVE')
    returning id, "lastName"
), rattachement as (
    insert into groupe_user (groupe_id, user_id)
    select gr.id, eleves.id from gr, eleves
), notes_continu as (
    -- Les trois provenances qu'un relevé peut afficher, réunies sur un seul
    -- contrôle : moyenne (Eleve1, Eleve4), non évaluée (Eleve3). Eleve2 sert
    -- la provenance rattrapage via ctrl_rattrapage ci-dessous.
    insert into note (note, not_evaluated, user_id, controle_id)
    select v.note, v.not_evaluated, eleves.id, ctrl_continu.id
    from eleves, ctrl_continu,
         (values ('Eleve1', 15.5::real, false), ('Eleve2', 5::real, false),
                 ('Eleve3', null::real, true), ('Eleve4', 17::real, false)
         ) as v("lastName", note, not_evaluated)
    where eleves."lastName" = v."lastName"
), notes_rattrapage as (
    -- Eleve2 : rattrapage validé (provenance affichée = rattrapage).
    -- Eleve4 : rattrapage saisi mais non validé (la moyenne du contrôle
    -- normal reste la provenance retenue).
    insert into note (note, is_validated, user_id, controle_id)
    select v.note, v.is_validated, eleves.id, ctrl_rattrapage.id
    from eleves, ctrl_rattrapage,
         (values ('Eleve2', 11::real, true), ('Eleve4', 7::real, false)
         ) as v("lastName", note, is_validated)
    where eleves."lastName" = v."lastName"
)
select 1;

-- ── Option sacrificielle (suite corbeille) ─────────────────────────────────
-- Un contrôle et un effectif non vide : la modale de suppression chiffre une
-- cascade non nulle, et la restauration a un effectif à retrouver.
with p as (
    select id from promotion where name = 'E2E Promotion'
), o as (
    insert into option (name, promotion_id) select 'E2E Option Sacrificielle', p.id from p returning id
), pe as (
    insert into periode (name, debut, fin, option_id)
    select 'E2E Periode Sacrificielle', '2025-09-01', '2026-01-31', o.id from o
    returning id
), ue as (
    insert into unite_enseignement (name, ects, academique, periode_id)
    select 'E2E UE Sacrificielle', 5, true, pe.id from pe
    returning id
), mat as (
    insert into matiere (name, heure, coeff, unite_enseignement_id)
    select 'E2E Matiere Sacrificielle', 20, 1, ue.id from ue
    returning id
), ctrl as (
    insert into controle (name, coeff, is_rattrapage, matiere_id)
    select 'E2E Controle Sacrificiel', 1, false, mat.id from mat
    returning id
), gr as (
    insert into groupe (name, option_id) select 'E2E Groupe Sacrificiel', o.id from o returning id
), eleve as (
    insert into "user" ("firstName", "lastName", email, type_personne)
    values ('E2E', 'Eleve5', 'e2e-eleve5@scolarite.local', 'ELEVE')
    returning id
), rattachement as (
    insert into groupe_user (groupe_id, user_id) select gr.id, eleve.id from gr, eleve
), note_ins as (
    insert into note (note, user_id, controle_id)
    select 12, eleve.id, ctrl.id from eleve, ctrl
)
select 1;

-- ── Option déjà délibérée (suite corbeille : refus de suppression) ────────
with p as (
    select id from promotion where name = 'E2E Promotion'
), o as (
    insert into option (name, promotion_id) select 'E2E Option Deliberee', p.id from p returning id
), pe as (
    insert into periode (name, debut, fin, option_id)
    select 'E2E Periode Deliberee', '2025-09-01', '2026-01-31', o.id from o
    returning id
), ue as (
    insert into unite_enseignement (name, ects, academique, periode_id)
    select 'E2E UE Deliberee', 5, true, pe.id from pe
    returning id
), gr as (
    insert into groupe (name, option_id) select 'E2E Groupe Deliberee', o.id from o returning id
), eleve as (
    insert into "user" ("firstName", "lastName", email, type_personne)
    values ('E2E', 'Eleve6', 'e2e-eleve6@scolarite.local', 'ELEVE')
    returning id
), rattachement as (
    insert into groupe_user (groupe_id, user_id) select gr.id, eleve.id from gr, eleve
)
insert into jury_result (user_id, periode_id, unite_enseignement_id, grade, gpa_index, ects, compte_cumul)
select eleve.id, pe.id, ue.id, 'B', 3, 5, true
from eleve, pe, ue;

commit;
