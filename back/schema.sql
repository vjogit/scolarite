


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;



COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';



CREATE DOMAIN public.my_null_bool AS boolean;



CREATE DOMAIN public.my_null_float AS double precision;



CREATE DOMAIN public.my_null_integer AS integer;



CREATE DOMAIN public.my_null_string AS text;



CREATE FUNCTION public.get_gpa_ues_by_periode_v5(p_periode_id integer) RETURNS TABLE(user_id integer, first_name public.my_null_string, last_name public.my_null_string, gpa_periode public.my_null_float, gpa_academique_periode public.my_null_float, total_ects_valides public.my_null_float, total_ects_periode public.my_null_float, gpa_cumule public.my_null_float, total_ects_valides_cumule public.my_null_float, total_ects_cumule public.my_null_float, unite_enseignement_id integer, moyenne_ue public.my_null_float, grade_lettre public.my_null_string, ects_ue public.my_null_float)
    LANGUAGE sql STABLE
    AS $$
 WITH
 periode_courante AS (
     SELECT
         p.id                            AS periode_id,
         p.debut                         AS periode_debut,
         o.promotion_id,
         prom.matiere_eliminatoire,
         prom.value_matiere_eliminatoire,
         prom.echelle_gpa,
         prom.echelle
     FROM public.periode p
     JOIN public.option o       ON p.option_id    = o.id
     JOIN public.promotion prom ON o.promotion_id = prom.id
     WHERE p.id = p_periode_id
     LIMIT 1
 ),
 context_rules AS (
     SELECT
         matiere_eliminatoire,
         value_matiere_eliminatoire,
         echelle_gpa,
         echelle
     FROM periode_courante
 ),
 -- Uniquement la période courante : les périodes passées sont lues depuis jury_result
 periodes_concernees AS (
     SELECT p_periode_id AS periode_id
 ),
 matieres_brutes AS (
     SELECT
         n.user_id,
         m.id                                                             AS matiere_id,
         m.unite_enseignement_id,
         ue.periode_id,
         m.coeff                                                          AS matiere_coeff,
         (SUM(n.note * c.coeff) FILTER (WHERE c.is_rattrapage = FALSE
                                          AND n.not_evaluated = FALSE) /
          NULLIF(SUM(c.coeff)   FILTER (WHERE c.is_rattrapage = FALSE
                                          AND n.not_evaluated = FALSE), 0)
         )::float                                                         AS moyenne_s1,
         COUNT(n.id) FILTER (WHERE c.is_rattrapage = TRUE
                                 AND n.is_validated = TRUE)               AS nb_rattrapages_valides,
         COUNT(n.id) FILTER (WHERE c.is_rattrapage = TRUE)               AS nb_total_rattrapages,
         BOOL_OR(n.not_evaluated)
             FILTER (WHERE c.is_rattrapage = FALSE)                      AS has_not_evaluated
     FROM periodes_concernees pc
     JOIN public.unite_enseignement ue ON ue.periode_id          = pc.periode_id
     JOIN public.matiere m             ON m.unite_enseignement_id = ue.id
     JOIN public.controle c            ON c.matiere_id           = m.id
     JOIN public.note n                ON n.controle_id          = c.id
     WHERE (c.is_rattrapage = FALSE AND (n.note IS NOT NULL OR n.not_evaluated = TRUE))
        OR (c.is_rattrapage = TRUE  AND n.is_validated IS NOT NULL)
     GROUP BY n.user_id, m.id, m.unite_enseignement_id, ue.periode_id, m.coeff
 ),
 -- Le rattrapage validé vaut le seuil « E » de la promotion, appliqué
 -- ICI, au niveau de la matière — comme le fait note_read_ue.sql.
 -- La v4 l'appliquait au niveau de l'UE et laissait la matière à sa
 -- moyenne S1, si bien qu'une matière rattrapée restait sous le
 -- seuil éliminatoire et faisait échouer l'UE : le même élève
 -- ressortait E côté Notes et F côté Jury.
 matieres_finales AS (
     SELECT
         user_id, matiere_id, unite_enseignement_id, periode_id,
         matiere_coeff, moyenne_s1, nb_rattrapages_valides,
         nb_total_rattrapages, has_not_evaluated,
         CASE
             WHEN has_not_evaluated          THEN NULL
             WHEN nb_rattrapages_valides > 0 THEN (SELECT echelle[5]::float FROM context_rules)
             ELSE moyenne_s1
         END AS moyenne_finale_matiere
     FROM matieres_brutes
 ),
 ues_calc AS (
     SELECT
         mf.user_id,
         mf.periode_id,
         mf.unite_enseignement_id,
         ue.ects,
         ue.academique,
         cr.echelle,
         BOOL_OR(mf.moyenne_finale_matiere IS NULL)                      AS is_not_evaluated,
         (SUM(mf.moyenne_finale_matiere * mf.matiere_coeff) /
          NULLIF(SUM(mf.matiere_coeff), 0))::float                        AS moyenne_ue,
         BOOL_OR(
             cr.matiere_eliminatoire IS TRUE
             AND mf.moyenne_finale_matiere < cr.value_matiere_eliminatoire
         )                                                                AS est_elimine
     FROM matieres_finales mf
     JOIN public.unite_enseignement ue ON mf.unite_enseignement_id = ue.id
     CROSS JOIN context_rules cr
     GROUP BY
         mf.user_id, mf.periode_id, mf.unite_enseignement_id,
         ue.ects, ue.academique, cr.echelle,
         cr.matiere_eliminatoire, cr.value_matiere_eliminatoire
 ),
 ues_with_gpa_index AS (
     SELECT
         uc.user_id,
         uc.periode_id,
         uc.unite_enseignement_id,
         uc.ects,
         uc.academique,
         uc.is_not_evaluated,
         CASE WHEN uc.is_not_evaluated THEN NULL ELSE uc.moyenne_ue END   AS moyenne_ue,
         CASE
             WHEN uc.is_not_evaluated                 THEN NULL
             WHEN uc.moyenne_ue IS NULL               THEN NULL
             WHEN uc.est_elimine                      THEN 0
             WHEN uc.moyenne_ue >= uc.echelle[1]      THEN 1
             WHEN uc.moyenne_ue >= uc.echelle[2]      THEN 2
             WHEN uc.moyenne_ue >= uc.echelle[3]      THEN 3
             WHEN uc.moyenne_ue >= uc.echelle[4]      THEN 4
             WHEN uc.moyenne_ue >= uc.echelle[5]      THEN 5
             ELSE 0
         END AS gpa_index,
         CASE
             WHEN uc.is_not_evaluated                 THEN 'N.E.'
             WHEN uc.moyenne_ue IS NULL               THEN NULL
             WHEN uc.est_elimine                      THEN 'F'
             WHEN uc.moyenne_ue >= uc.echelle[1]      THEN 'A'
             WHEN uc.moyenne_ue >= uc.echelle[2]      THEN 'B'
             WHEN uc.moyenne_ue >= uc.echelle[3]      THEN 'C'
             WHEN uc.moyenne_ue >= uc.echelle[4]      THEN 'D'
             WHEN uc.moyenne_ue >= uc.echelle[5]      THEN 'E'
             ELSE 'F'
         END AS grade_lettre
     FROM ues_calc uc
 ),
 gpa_par_periode AS (
     SELECT
         ug.user_id,
         SUM(ug.ects) FILTER (WHERE ug.gpa_index > 0)                    AS total_ects_valides,
         -- Dénominateur : toutes les UE que l'élève suit, non évaluées
         -- comprises. La v4 les écartait, si bien qu'une élève à qui
         -- il manquait une UE de 6 ECTS lisait « 4 / 4 », soit 100 %
         -- validés. Une UE que l'élève ne suit pas ne produit aucune
         -- ligne et reste, elle, hors du décompte.
         SUM(ug.ects)                                                    AS total_ects_periode,
         -- Une seule UE non évaluée annule le GPA : le semestre n'est
         -- pas terminé, l'élève repassera en jury une fois complet.
         CASE WHEN BOOL_OR(ug.is_not_evaluated) THEN NULL ELSE (SUM(
             CASE WHEN ug.gpa_index IS NULL THEN 0
                  WHEN ug.gpa_index = 0    THEN 0
                  ELSE cr.echelle_gpa[ug.gpa_index]
             END * ug.ects
         ) / NULLIF(SUM(ug.ects), 0)) END::float AS gpa_periode,
         CASE WHEN BOOL_OR(ug.is_not_evaluated) THEN NULL ELSE (SUM(
             CASE WHEN ug.gpa_index IS NULL THEN 0
                  WHEN ug.gpa_index = 0    THEN 0
                  ELSE cr.echelle_gpa[ug.gpa_index]
             END * ug.ects
         ) FILTER (WHERE ug.academique = TRUE)
         / NULLIF(SUM(ug.ects) FILTER (WHERE ug.academique = TRUE), 0)) END::float AS gpa_academique_periode
     FROM ues_with_gpa_index ug
     CROSS JOIN context_rules cr
     GROUP BY ug.user_id
 ),
 -- Données historiques : périodes passées déjà délibérées, lues depuis jury_result.
 -- Chaque entrée avec compte_cumul = false est exclue du calcul (ex: année échouée du redoublant).
 gpa_historique AS (
     SELECT
         jr.user_id,
         SUM(
             CASE WHEN jr.gpa_index > 0 AND jr.compte_cumul
                  THEN cr.echelle_gpa[jr.gpa_index] * jr.ects
                  ELSE 0
             END
         )                                                                AS gpa_num,
         SUM(CASE WHEN jr.compte_cumul AND jr.gpa_index IS NOT NULL
                  THEN jr.ects ELSE 0 END)                               AS gpa_den,
         SUM(CASE WHEN jr.gpa_index > 0 AND jr.compte_cumul
                  THEN jr.ects ELSE 0 END)                               AS ects_valides,
         SUM(CASE WHEN jr.compte_cumul AND jr.gpa_index IS NOT NULL
                  THEN jr.ects ELSE 0 END)                               AS ects_total
     FROM public.jury_result jr
     JOIN public.periode p ON p.id = jr.periode_id
     CROSS JOIN context_rules cr
     WHERE p.debut < (SELECT periode_debut FROM periode_courante)
     GROUP BY jr.user_id
 ),
 -- GPA cumulé = historique délibéré + période courante calculée dynamiquement
 gpa_cumule AS (
     SELECT
         gpp.user_id,
         (
             (COALESCE(gh.gpa_num, 0) +
              COALESCE(gpp.gpa_periode * gpp.total_ects_periode, 0)) /
             NULLIF(COALESCE(gh.gpa_den, 0) + COALESCE(gpp.total_ects_periode, 0), 0)
         )::float                                                         AS gpa_cumule,
         COALESCE(gh.ects_valides, 0) + COALESCE(gpp.total_ects_valides, 0)
                                                                          AS total_ects_valides_cumule,
         COALESCE(gh.ects_total,   0) + COALESCE(gpp.total_ects_periode, 0)
                                                                          AS total_ects_cumule
     FROM gpa_par_periode gpp
     LEFT JOIN gpa_historique gh ON gh.user_id = gpp.user_id
 )
 SELECT
     u.id::integer,
     u."firstName"::public.my_null_string,
     u."lastName"::public.my_null_string,
     gpp.gpa_periode::public.my_null_float,
     gpp.gpa_academique_periode::public.my_null_float,
     gpp.total_ects_valides::public.my_null_float,
     gpp.total_ects_periode::public.my_null_float,
     gc.gpa_cumule::public.my_null_float,
     gc.total_ects_valides_cumule::public.my_null_float,
     gc.total_ects_cumule::public.my_null_float,
     ug.unite_enseignement_id::integer,
     ug.moyenne_ue::public.my_null_float,
     ug.grade_lettre::public.my_null_string,
     ug.ects::public.my_null_float AS ects_ue
 FROM gpa_cumule gc
 JOIN gpa_par_periode gpp   ON gpp.user_id = gc.user_id
 JOIN ues_with_gpa_index ug ON ug.user_id  = gc.user_id
 JOIN public."user" u       ON u.id        = gc.user_id
 ORDER BY gc.gpa_cumule DESC NULLS LAST, u."lastName";
 $$;



CREATE FUNCTION public.sync_reservation_horaire() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- INSERT : on peuple horaire dans les tables de jointure dès la création
    -- UPDATE : on propage uniquement si l'horaire a changé
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.horaire <> OLD.horaire) THEN
        UPDATE public.reservation_salle
            SET horaire = NEW.horaire
            WHERE reservation_id = NEW.id;

        UPDATE public.reservation_intervenant
            SET horaire = NEW.horaire
            WHERE reservation_id = NEW.id;

        UPDATE public.reservation_groupe
            SET horaire = NEW.horaire
            WHERE reservation_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;


CREATE TABLE public.controle (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    coeff real NOT NULL,
    is_rattrapage boolean DEFAULT false NOT NULL,
    remarque text,
    matiere_id integer NOT NULL
);



ALTER TABLE public.controle ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.controle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.corbeille_operation (
    id integer NOT NULL,
    racine_type text NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_by text NOT NULL,
    CONSTRAINT chk_corbeille_racine_type CHECK ((racine_type = ANY (ARRAY['formation'::text, 'promotion'::text, 'option'::text, 'periode'::text])))
);



ALTER TABLE public.corbeille_operation ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.corbeille_operation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.formation (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    deleted_at timestamp with time zone,
    delete_op_id integer,
    CONSTRAINT chk_formation_deleted_coherent CHECK (((deleted_at IS NULL) = (delete_op_id IS NULL))),
    CONSTRAINT chk_formation_name_length CHECK ((length(name) > 0))
);



COMMENT ON TABLE public.formation IS 'swagger: commentaire swagger pour formation';



COMMENT ON COLUMN public.formation.name IS 'swagger: commentaire pour name de formation
tags:
  validate: email,required
  example: nom de la formation';



CREATE VIEW public.formation_active AS
 SELECT id,
    version,
    name
   FROM public.formation
  WHERE (deleted_at IS NULL);



ALTER TABLE public.formation ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.formation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.groupe (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    option_id integer NOT NULL,
    CONSTRAINT chk_groupe_name_length CHECK ((length(name) > 0))
);



COMMENT ON COLUMN public.groupe.name IS 'Ex: Groupe 1, Groupe 2, Groupe TP A...';



COMMENT ON COLUMN public.groupe.option_id IS 'Option à laquelle appartient ce groupe';



ALTER TABLE public.groupe ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.groupe_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.groupe_user (
    groupe_id integer NOT NULL,
    user_id integer NOT NULL
);



CREATE TABLE public.jury_result (
    user_id integer NOT NULL,
    periode_id integer NOT NULL,
    unite_enseignement_id integer NOT NULL,
    grade text,
    gpa_index integer,
    ects real,
    compte_cumul boolean DEFAULT true NOT NULL,
    delibere_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_jury_result_gpa_index CHECK (((gpa_index >= 0) AND (gpa_index <= 5))),
    CONSTRAINT chk_jury_result_grade CHECK ((grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text, 'F'::text, 'N.E.'::text])))
);



CREATE TABLE public.matiere (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    heure real NOT NULL,
    coeff real NOT NULL,
    color text,
    unite_enseignement_id integer NOT NULL,
    CONSTRAINT chk_matiere_coeff_positive CHECK ((coeff >= (0)::double precision)),
    CONSTRAINT chk_matiere_heure_positive CHECK ((heure >= (0)::double precision)),
    CONSTRAINT chk_matiere_name_length CHECK ((length(name) > 0))
);



ALTER TABLE public.matiere ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.matiere_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.mobilite_internationale (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    pays text NOT NULL,
    ville text,
    type_mobilite text,
    date_debut timestamp with time zone NOT NULL,
    date_fin timestamp with time zone NOT NULL,
    est_valide boolean DEFAULT false NOT NULL,
    remarque text,
    promotion_id integer NOT NULL,
    user_id integer NOT NULL
);



COMMENT ON COLUMN public.mobilite_internationale.type_mobilite IS 'Ex: Stage, Semestre académique, Job d''été';



ALTER TABLE public.mobilite_internationale ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.mobilite_internationale_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.note (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    note real,
    remarque text,
    is_validated boolean DEFAULT false NOT NULL,
    not_evaluated boolean DEFAULT false NOT NULL,
    user_id integer NOT NULL,
    controle_id integer NOT NULL,
    CONSTRAINT chk_note_max_absolu CHECK ((note <= (1000)::double precision)),
    CONSTRAINT chk_note_positive CHECK ((note >= (0)::double precision))
);



ALTER TABLE public.note ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.note_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.option (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    promotion_id integer NOT NULL,
    deleted_at timestamp with time zone,
    delete_op_id integer,
    CONSTRAINT chk_option_deleted_coherent CHECK (((deleted_at IS NULL) = (delete_op_id IS NULL))),
    CONSTRAINT chk_option_name_length CHECK ((length(name) > 0))
);



CREATE VIEW public.option_active AS
 SELECT id,
    version,
    name,
    promotion_id
   FROM public.option
  WHERE (deleted_at IS NULL);



ALTER TABLE public.option ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.option_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.periode (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    debut timestamp with time zone NOT NULL,
    fin timestamp with time zone NOT NULL,
    option_id integer NOT NULL,
    deleted_at timestamp with time zone,
    delete_op_id integer,
    CONSTRAINT chk_periode_dates CHECK ((fin > debut)),
    CONSTRAINT chk_periode_deleted_coherent CHECK (((deleted_at IS NULL) = (delete_op_id IS NULL))),
    CONSTRAINT chk_periode_name_length CHECK ((length(name) > 0))
);



CREATE VIEW public.periode_active AS
 SELECT id,
    version,
    name,
    debut,
    fin,
    option_id
   FROM public.periode
  WHERE (deleted_at IS NULL);



ALTER TABLE public.periode ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.periode_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.promotion (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    debut timestamp with time zone NOT NULL,
    fin timestamp with time zone NOT NULL,
    echelle_gpa real[] NOT NULL,
    echelle real[] NOT NULL,
    matiere_eliminatoire boolean,
    value_matiere_eliminatoire double precision,
    formation_id integer NOT NULL,
    bareme real DEFAULT 20 NOT NULL,
    deleted_at timestamp with time zone,
    delete_op_id integer,
    CONSTRAINT chk_promotion_bareme_positive CHECK ((bareme > (0)::double precision)),
    CONSTRAINT chk_promotion_dates CHECK ((fin > debut)),
    CONSTRAINT chk_promotion_deleted_coherent CHECK (((deleted_at IS NULL) = (delete_op_id IS NULL))),
    CONSTRAINT chk_promotion_echelle_bareme CHECK ((echelle[1] <= bareme)),
    CONSTRAINT chk_promotion_echelle_desc CHECK (((echelle[1] > echelle[2]) AND (echelle[2] > echelle[3]) AND (echelle[3] > echelle[4]) AND (echelle[4] > echelle[5]))),
    CONSTRAINT chk_promotion_echelle_gpa CHECK (((echelle_gpa[1] > echelle_gpa[2]) AND (echelle_gpa[2] > echelle_gpa[3]) AND (echelle_gpa[3] > echelle_gpa[4]) AND (echelle_gpa[4] > echelle_gpa[5]) AND (echelle_gpa[5] > echelle_gpa[6]))),
    CONSTRAINT chk_promotion_echelle_len CHECK ((array_length(echelle, 1) = 5)),
    CONSTRAINT chk_promotion_name_length CHECK ((length(name) > 0)),
    CONSTRAINT chk_ue_echelle_gpa_len CHECK ((array_length(echelle_gpa, 1) = 6))
);



CREATE VIEW public.promotion_active AS
 SELECT id,
    version,
    name,
    debut,
    fin,
    echelle_gpa,
    echelle,
    matiere_eliminatoire,
    value_matiere_eliminatoire,
    formation_id,
    bareme
   FROM public.promotion
  WHERE (deleted_at IS NULL);



ALTER TABLE public.promotion ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.promotion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.registre (
    seq bigint NOT NULL,
    op text NOT NULL,
    user_id integer NOT NULL,
    note_id integer,
    controle_id integer,
    old_note real,
    new_note real,
    not_evaluated boolean,
    is_validated boolean,
    remarque_hash character(64),
    periode_id integer,
    unite_enseignement_id integer,
    grade text,
    gpa_index integer,
    ects real,
    compte_cumul boolean,
    author_sub text NOT NULL,
    event_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    prev_hash character(64) NOT NULL,
    hash character(64) NOT NULL
);



CREATE TABLE public.registre_ancre (
    id bigint NOT NULL,
    registre_seq bigint NOT NULL,
    anchored_hash character(64) NOT NULL,
    tsa_url text NOT NULL,
    hash_algorithm text NOT NULL,
    token bytea NOT NULL,
    tsa_cert bytea,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



ALTER TABLE public.registre_ancre ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.registre_ancre_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE public.registre ALTER COLUMN seq ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.registre_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.registre_temoin (
    id bigint NOT NULL,
    ancre_id bigint NOT NULL,
    registre_seq bigint NOT NULL,
    recipient text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    error text
);



ALTER TABLE public.registre_temoin ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.registre_temoin_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.reservation (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    horaire tstzrange NOT NULL,
    periode_id integer NOT NULL,
    matiere_id integer,
    type_cours text,
    is_distanciel boolean DEFAULT false NOT NULL,
    description text
);



COMMENT ON COLUMN public.reservation.horaire IS 'Intervalle horodaté du cours (ex: [2024-09-02 08:00, 2024-09-02 10:00))';



COMMENT ON COLUMN public.reservation.periode_id IS 'Période pédagogique à laquelle appartient cette réservation';



COMMENT ON COLUMN public.reservation.matiere_id IS 'Nullable : une réservation peut ne pas être liée à une matière (réunion, événement...)';



COMMENT ON COLUMN public.reservation.type_cours IS 'CM, TD, TP, EXAMEN, RATTRAPAGE';



CREATE TABLE public.reservation_groupe (
    reservation_id integer NOT NULL,
    groupe_id integer NOT NULL,
    horaire tstzrange NOT NULL
);



COMMENT ON COLUMN public.reservation_groupe.horaire IS 'Dénormalisé depuis reservation.horaire — maintenu par trigger';



ALTER TABLE public.reservation ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.reservation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.reservation_intervenant (
    reservation_id integer NOT NULL,
    user_id integer NOT NULL,
    horaire tstzrange NOT NULL
);



COMMENT ON COLUMN public.reservation_intervenant.horaire IS 'Dénormalisé depuis reservation.horaire — maintenu par trigger';



CREATE TABLE public.reservation_salle (
    reservation_id integer NOT NULL,
    salle_id integer NOT NULL,
    horaire tstzrange NOT NULL
);



COMMENT ON COLUMN public.reservation_salle.horaire IS 'Dénormalisé depuis reservation.horaire — maintenu par trigger';



CREATE TABLE public.salle (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    capacite integer NOT NULL,
    equipement text,
    type_salle text,
    batiment text,
    CONSTRAINT chk_salle_capacite CHECK ((capacite > 0)),
    CONSTRAINT chk_salle_name_length CHECK ((length(name) > 0))
);



COMMENT ON COLUMN public.salle.type_salle IS 'AMPHI, TD, TP, LABO, INFORMATIQUE';



ALTER TABLE public.salle ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.salle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.toeic (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    score integer NOT NULL,
    date_passage timestamp with time zone NOT NULL,
    remarque text,
    promotion_id integer NOT NULL,
    user_id integer NOT NULL,
    CONSTRAINT chk_toeic_score CHECK (((score >= 0) AND (score <= 990)))
);



ALTER TABLE public.toeic ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.toeic_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public.unite_enseignement (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    ects real NOT NULL,
    academique boolean DEFAULT true NOT NULL,
    periode_id integer NOT NULL,
    CONSTRAINT chk_ue_ects_positive CHECK ((ects >= (0)::double precision))
);



ALTER TABLE public.unite_enseignement ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.unite_enseignement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE public."user" (
    id integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "firstName" text,
    "lastName" text,
    email text,
    keycloak_id text,
    type_personne text DEFAULT 'AGENT'::text NOT NULL,
    CONSTRAINT chk_user_type_personne CHECK ((type_personne = ANY (ARRAY['ELEVE'::text, 'AGENT'::text])))
);



ALTER TABLE public."user" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY public.controle
    ADD CONSTRAINT controle_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.corbeille_operation
    ADD CONSTRAINT corbeille_operation_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.formation
    ADD CONSTRAINT formation_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.groupe
    ADD CONSTRAINT groupe_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.groupe_user
    ADD CONSTRAINT groupe_user_pkey PRIMARY KEY (groupe_id, user_id);



ALTER TABLE ONLY public.matiere
    ADD CONSTRAINT matiere_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.mobilite_internationale
    ADD CONSTRAINT mobilite_internationale_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.note
    ADD CONSTRAINT note_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.option
    ADD CONSTRAINT option_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.periode
    ADD CONSTRAINT periode_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.jury_result
    ADD CONSTRAINT pk_jury_result PRIMARY KEY (user_id, periode_id, unite_enseignement_id);



ALTER TABLE ONLY public.promotion
    ADD CONSTRAINT promotion_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.registre_ancre
    ADD CONSTRAINT registre_ancre_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.registre
    ADD CONSTRAINT registre_hash_key UNIQUE (hash);



ALTER TABLE ONLY public.registre
    ADD CONSTRAINT registre_pkey PRIMARY KEY (seq);



ALTER TABLE ONLY public.registre_temoin
    ADD CONSTRAINT registre_temoin_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.reservation_groupe
    ADD CONSTRAINT reservation_groupe_pkey PRIMARY KEY (reservation_id, groupe_id);



ALTER TABLE ONLY public.reservation_intervenant
    ADD CONSTRAINT reservation_intervenant_pkey PRIMARY KEY (reservation_id, user_id);



ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT reservation_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.reservation_salle
    ADD CONSTRAINT reservation_salle_pkey PRIMARY KEY (reservation_id, salle_id);



ALTER TABLE ONLY public.salle
    ADD CONSTRAINT salle_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.reservation_groupe
    ADD CONSTRAINT sans_conflit_groupe EXCLUDE USING gist (groupe_id WITH =, horaire WITH &&);



ALTER TABLE ONLY public.reservation_intervenant
    ADD CONSTRAINT sans_conflit_intervenant EXCLUDE USING gist (user_id WITH =, horaire WITH &&);



ALTER TABLE ONLY public.reservation_salle
    ADD CONSTRAINT sans_conflit_salle EXCLUDE USING gist (salle_id WITH =, horaire WITH &&);



ALTER TABLE ONLY public.toeic
    ADD CONSTRAINT toeic_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.groupe
    ADD CONSTRAINT uk_groupe_name_option UNIQUE (name, option_id);



ALTER TABLE ONLY public.note
    ADD CONSTRAINT uk_note_controle_user UNIQUE (controle_id, user_id);



ALTER TABLE ONLY public.unite_enseignement
    ADD CONSTRAINT unite_enseignement_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);



ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_keycloak_id_key UNIQUE (keycloak_id);



ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);



CREATE INDEX idx_controle_matiere_id ON public.controle USING btree (matiere_id);



CREATE INDEX idx_groupe_option_id ON public.groupe USING btree (option_id);



CREATE INDEX idx_gu_user_id ON public.groupe_user USING btree (user_id);



CREATE INDEX idx_jury_result_periode ON public.jury_result USING btree (periode_id);



CREATE INDEX idx_jury_result_user_periode ON public.jury_result USING btree (user_id, periode_id);



CREATE INDEX idx_matiere_ue_id ON public.matiere USING btree (unite_enseignement_id);



CREATE INDEX idx_mobilite_user_id ON public.mobilite_internationale USING btree (user_id);



CREATE INDEX idx_note_perf_stats ON public.note USING btree (controle_id, user_id) INCLUDE (note) WHERE (note IS NOT NULL);



CREATE INDEX idx_note_user_id ON public.note USING btree (user_id);



CREATE INDEX idx_option_promotion_id ON public.option USING btree (promotion_id);



CREATE INDEX idx_periode_option_id ON public.periode USING btree (option_id);



CREATE INDEX idx_registre_note ON public.registre USING btree (note_id);



CREATE INDEX idx_registre_temoin_ancre ON public.registre_temoin USING btree (ancre_id);



CREATE INDEX idx_registre_user ON public.registre USING btree (user_id);



CREATE INDEX idx_reservation_horaire ON public.reservation USING btree (horaire);



CREATE INDEX idx_reservation_periode ON public.reservation USING btree (periode_id);



CREATE INDEX idx_rg_groupe_id ON public.reservation_groupe USING btree (groupe_id);



CREATE INDEX idx_ri_user_id ON public.reservation_intervenant USING btree (user_id);



CREATE INDEX idx_rs_salle_id ON public.reservation_salle USING btree (salle_id);



CREATE INDEX idx_ue_periode_id ON public.unite_enseignement USING btree (periode_id);



CREATE UNIQUE INDEX uk_formation_name_active ON public.formation USING btree (name) WHERE (deleted_at IS NULL);



CREATE UNIQUE INDEX uk_promotion_name_active ON public.promotion USING btree (name) WHERE (deleted_at IS NULL);



CREATE TRIGGER trg_sync_reservation_horaire AFTER INSERT OR UPDATE ON public.reservation FOR EACH ROW EXECUTE FUNCTION public.sync_reservation_horaire();



ALTER TABLE ONLY public.mobilite_internationale
    ADD CONSTRAINT fk_certification_mobilite_internationale_promotion FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.toeic
    ADD CONSTRAINT fk_certification_toeic_promotion FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.controle
    ADD CONSTRAINT fk_controles_matieres FOREIGN KEY (matiere_id) REFERENCES public.matiere(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.formation
    ADD CONSTRAINT fk_formation_delete_op FOREIGN KEY (delete_op_id) REFERENCES public.corbeille_operation(id);



ALTER TABLE ONLY public.groupe
    ADD CONSTRAINT fk_groupe_option FOREIGN KEY (option_id) REFERENCES public.option(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.groupe_user
    ADD CONSTRAINT fk_gu_groupe FOREIGN KEY (groupe_id) REFERENCES public.groupe(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.groupe_user
    ADD CONSTRAINT fk_gu_user FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.jury_result
    ADD CONSTRAINT fk_jury_result_periode FOREIGN KEY (periode_id) REFERENCES public.periode(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.jury_result
    ADD CONSTRAINT fk_jury_result_ue FOREIGN KEY (unite_enseignement_id) REFERENCES public.unite_enseignement(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.jury_result
    ADD CONSTRAINT fk_jury_result_user FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.matiere
    ADD CONSTRAINT fk_matiere_ue FOREIGN KEY (unite_enseignement_id) REFERENCES public.unite_enseignement(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.mobilite_internationale
    ADD CONSTRAINT fk_mobilite_internationale_user FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.note
    ADD CONSTRAINT fk_notes_controles FOREIGN KEY (controle_id) REFERENCES public.controle(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.note
    ADD CONSTRAINT fk_notes_users FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.option
    ADD CONSTRAINT fk_option_delete_op FOREIGN KEY (delete_op_id) REFERENCES public.corbeille_operation(id);



ALTER TABLE ONLY public.option
    ADD CONSTRAINT fk_option_promotion FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.periode
    ADD CONSTRAINT fk_periode_delete_op FOREIGN KEY (delete_op_id) REFERENCES public.corbeille_operation(id);



ALTER TABLE ONLY public.periode
    ADD CONSTRAINT fk_periode_option FOREIGN KEY (option_id) REFERENCES public.option(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.promotion
    ADD CONSTRAINT fk_promotion_delete_op FOREIGN KEY (delete_op_id) REFERENCES public.corbeille_operation(id);



ALTER TABLE ONLY public.promotion
    ADD CONSTRAINT fk_promotion_formation FOREIGN KEY (formation_id) REFERENCES public.formation(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.registre_ancre
    ADD CONSTRAINT fk_registre_ancre_registre FOREIGN KEY (registre_seq) REFERENCES public.registre(seq) ON DELETE RESTRICT;



ALTER TABLE ONLY public.registre_temoin
    ADD CONSTRAINT fk_registre_temoin_ancre FOREIGN KEY (ancre_id) REFERENCES public.registre_ancre(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT fk_reservation_matiere FOREIGN KEY (matiere_id) REFERENCES public.matiere(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT fk_reservation_periode FOREIGN KEY (periode_id) REFERENCES public.periode(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.reservation_groupe
    ADD CONSTRAINT fk_rg_groupe FOREIGN KEY (groupe_id) REFERENCES public.groupe(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.reservation_groupe
    ADD CONSTRAINT fk_rg_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservation(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.reservation_intervenant
    ADD CONSTRAINT fk_ri_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservation(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.reservation_intervenant
    ADD CONSTRAINT fk_ri_user FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.reservation_salle
    ADD CONSTRAINT fk_rs_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservation(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.reservation_salle
    ADD CONSTRAINT fk_rs_salle FOREIGN KEY (salle_id) REFERENCES public.salle(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.toeic
    ADD CONSTRAINT fk_toeic_user FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.unite_enseignement
    ADD CONSTRAINT fk_ue_periode FOREIGN KEY (periode_id) REFERENCES public.periode(id) ON DELETE CASCADE;




