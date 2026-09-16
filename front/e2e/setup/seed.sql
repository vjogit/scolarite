-- Jeu de données de la suite Playwright (front/e2e).
--
-- Idempotent par construction : tout objet créé ici porte le préfixe
-- « E2E » (formation/promotion, noms uniques en base) ou le domaine
-- e2e-*@scolarite.local (élèves) — la purge en tête de script ne supprime
-- donc que ce que ce script a lui-même posé, jamais la hiérarchie
-- manuellement vérifiée qui vit à côté (voir la mémoire
-- jeu-donnees-verif-hierarchie). Deux exécutions consécutives DE CE SCRIPT
-- laissent l'état final identique : c'est la preuve attendue en étape 4.
--
-- Ne pas lire au-delà de ce que ça dit : l'idempotence est celle du script,
-- pas de la suite qui le consomme. Les tests, eux, MUTENT cet état (notes
-- saisies, éléments mis à la corbeille...) et certains dépendent de ce
-- qu'un test précédent y a laissé (voir grille-saisie.spec.ts). La suite
-- n'est reproductible que si ce script est reposé avant chaque exécution —
-- ce que `e2e/setup/globalSetup.ts` fait désormais sans condition, quel que
-- soit le point d'entrée. Voir docs/migration-shadcn/01bis-stabilisation-e2e.md.
--
-- Une branche dédiée plutôt que la réutilisation de données existantes : un
-- aller-retour Excel a déjà détruit un jeu de données partagé par le passé.

begin;

-- ── Purge ────────────────────────────────────────────────────────────────
-- Les CASCADE du schéma (formation → promotion → option → périodes/groupes →
-- UE → matières → contrôles → notes ; périodes/UE → jury_result ; groupes →
-- groupe_user) emportent tout le reste depuis la formation. Les élèves n'ont
-- pas de lien vers la formation : purge séparée par domaine de courriel.
delete from formation where name in ('E2E Formation', 'E2E Autre Formation');
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

-- ── Syllabus (lot 2) ──────────────────────────────────────────────────────
-- Un agent responsable (purgé par la règle sur le domaine e2e-*), la fiche de
-- « E2E Matiere » et la description de « E2E UE1 ». La ventilation encadrée
-- fait 15 + 4 + 1 = 20 h, exactement `matiere.heure` : l'état semé est
-- conforme, et c'est la spec qui crée l'écart puis le résorbe. La fiche suit
-- la matière par cascade : l'idempotence par pose est inchangée.
with agent as (
    insert into "user" ("firstName", "lastName", email, type_personne)
    values ('E2E', 'Agent1', 'e2e-agent1@scolarite.local', 'AGENT')
    returning id
), fiche as (
    insert into syllabus_matiere (matiere_id, contexte, objectifs, prerequis,
                                  heures_cours_td, heures_tp, heures_controle, heures_perso, responsable_id)
    select m.id,
           'Les systèmes logiciels évoluent vite et reposent sur de multiples bibliothèques.',
           'Gérer les dépendances, les risques et la maintenabilité d''un logiciel.',
           'Savoir concevoir un logiciel.',
           15, 4, 1, 10, agent.id
    from matiere m, agent
    where m.name = 'E2E Matiere'
)
update unite_enseignement ue
set description = 'Concevoir et maintenir un logiciel dans la durée.',
    responsable_id = agent.id
from agent
where ue.name = 'E2E UE1';

-- ── Compétences (lot 3 syllabus) ──────────────────────────────────────────
-- Ce que la famille « matrice de l'UE » consomme, jamais ce que la famille
-- « administration du référentiel » teste (celle-ci crée, vérifie et supprime
-- les siens, la base ressort comme elle est entrée). Deux blocs d'ordres
-- distincts sur « E2E Formation » — l'un à deux compétences, l'autre à une —
-- prouvent regroupement, ordre et codes dérivés « C1/C2 » ; une formation
-- étrangère minimale (un bloc, une compétence) prouve que la matrice de
-- l'UE E2E ne liste que sa formation (pendant lecture de la garantie
-- serveur) ; une liaison pré-cochée (C1 du bloc 1 : enseignée + évaluée) sert
-- la lecture CONSULTATION sans dépendre d'une spec d'écriture. La formation
-- étrangère est purgée en tête comme l'autre ; blocs, compétences et
-- liaisons suivent leur formation et leur UE par cascade — idempotence par
-- pose inchangée. « E2E Autre Formation » et non « E2E Formation Etrangere » :
-- « E2E Formation » en serait le préfixe, et les localisateurs Playwright
-- matchent par sous-chaîne (mode strict, précédent « E2E Promo Vide »).
with f as (
    select id from formation where name = 'E2E Formation'
), b1 as (
    insert into bloc_competence (formation_id, ordre, libelle, code, activites, modalites_evaluation)
    select f.id, 1, 'E2E Bloc Securiser', 'E2E-BC1',
           'Analyser les risques d''un système d''information et concevoir sa sécurisation.',
           'Étude de cas évaluée en soutenance.'
    from f
    returning id
), b2 as (
    insert into bloc_competence (formation_id, ordre, libelle)
    select f.id, 2, 'E2E Bloc Concevoir' from f
    returning id
), c11 as (
    insert into competence (bloc_id, ordre, action, contexte, finalites)
    select b1.id, 1, 'E2E Analyser les risques', 'en cartographiant les actifs', 'afin de prioriser les mesures'
    from b1
    returning id
), c12 as (
    insert into competence (bloc_id, ordre, action)
    select b1.id, 2, 'E2E Modeliser des solutions' from b1
    returning id
), c21 as (
    insert into competence (bloc_id, ordre, action)
    select b2.id, 1, 'E2E Concevoir une architecture' from b2
    returning id
), liaison as (
    insert into ue_competence (ue_id, competence_id, enseignee, mise_en_oeuvre, evaluee)
    select ue.id, c11.id, true, false, true
    from unite_enseignement ue, c11
    where ue.name = 'E2E UE1'
), fe as (
    insert into formation (name) values ('E2E Autre Formation') returning id
), be as (
    insert into bloc_competence (formation_id, ordre, libelle)
    select fe.id, 1, 'E2E Bloc Etranger' from fe
    returning id
)
insert into competence (bloc_id, ordre, action)
select be.id, 1, 'E2E Competence Etrangere' from be;

-- ── Promotion vide (dialogue de suppression avec saisie — lot 4ter) ────────
-- Sans descendance : sa suppression n'est pas bloquée par la période
-- délibérée, contrairement à « E2E Formation » et « E2E Promotion » qui la
-- contiennent — c'est donc la seule entité du seed à afficher la saisie de
-- confirmation (`deleteRequiresNameConfirmation`) plutôt que l'état bloqué.
-- Aucun test ne la supprime : le dialogue est ouvert puis refermé. Portée par
-- « E2E Formation » : la purge en tête de script l'emporte par CASCADE,
-- l'idempotence par pose est inchangée.
insert into promotion (name, debut, fin, echelle_gpa, echelle, matiere_eliminatoire, value_matiere_eliminatoire, formation_id, bareme)
select 'E2E Promo Vide', '2025-09-01', '2026-08-31',
       array[4, 3.5, 3, 2.5, 2, 0]::real[], array[16, 14, 12, 10, 8]::real[],
       true, 6, f.id, 20
from formation f
where f.name = 'E2E Formation';

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
