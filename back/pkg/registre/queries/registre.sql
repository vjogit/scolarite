-- Requêtes du registre chaîné (table registre). L'UNIQUE implémentation du
-- chaînage est dans pkg/registre/registre.go ; personne d'autre n'écrit dans
-- cette table. Les lectures des tables note et jury_result servent aux
-- traceurs (suppression en masse, purge corbeille, effacement RGPD) : l'état
-- détruit doit être lu AVANT la destruction, dans la même transaction.

-- name: AcquireRegistreLock :exec
-- Sérialise les écritures concurrentes du registre : sans ce verrou, deux
-- insertions simultanées pourraient partager le même prev_hash et casser la
-- chaîne. Verrou de niveau transaction, relâché automatiquement au COMMIT ou
-- au ROLLBACK. À n'appeler que dans une transaction déjà ouverte.
SELECT pg_advisory_xact_lock(@key);

-- name: GetLastMaillon :one
-- Dernier maillon du registre (démarrage d'un append, futur ancrage TSA).
SELECT seq, hash FROM public.registre ORDER BY seq DESC LIMIT 1;

-- name: InsertMaillon :one
-- Insère un maillon. recorded_at est fourni explicitement (pas de DEFAULT)
-- pour être connu avant le calcul du hash.
INSERT INTO public.registre (
    op, user_id,
    note_id, controle_id, old_note, new_note, not_evaluated, is_validated, remarque_hash,
    periode_id, unite_enseignement_id, grade, gpa_index, ects, compte_cumul,
    author_sub, event_at, recorded_at, prev_hash, hash
) VALUES (
    @op, @user_id,
    @note_id, @controle_id, @old_note, @new_note, @not_evaluated, @is_validated, @remarque_hash,
    @periode_id, @unite_enseignement_id, @grade, @gpa_index, @ects, @compte_cumul,
    @author_sub, @event_at, @recorded_at, @prev_hash, @hash
) RETURNING seq;

-- name: ListMaillonsBySeq :many
-- Parcours ordonné pour la vérification de chaîne : recalcule chaque hash.
SELECT seq, op, user_id,
       note_id, controle_id, old_note, new_note, not_evaluated, is_validated, remarque_hash,
       periode_id, unite_enseignement_id, grade, gpa_index, ects, compte_cumul,
       author_sub, event_at, recorded_at, prev_hash, hash
FROM public.registre
ORDER BY seq ASC;

-- name: ListMaillonsByUser :many
-- Extraction de tous les maillons d'un élève — droit d'accès (art. 15 RGPD).
SELECT seq, op, user_id,
       note_id, controle_id, old_note, new_note, not_evaluated, is_validated, remarque_hash,
       periode_id, unite_enseignement_id, grade, gpa_index, ects, compte_cumul,
       author_sub, event_at, recorded_at, prev_hash, hash
FROM public.registre
WHERE user_id = @user_id
ORDER BY seq ASC;

-- name: GetMaillonByHash :one
-- Recherche un maillon par son empreinte (vérification d'un témoin externe :
-- le hash scellé par la TSA devra exister dans la chaîne actuelle).
SELECT seq, event_at, recorded_at FROM public.registre WHERE hash = @hash;

-- ── Ancrage RFC 3161 et témoin externe (portage rex-imt) ─────────────────────
-- Les tables registre_ancre et registre_temoin sont celles du lot précédent
-- (infra/liquibase/releases/v0.01/006-registre). Seules les fonctions
-- d'ancrage (anchor.go, witness.go) écrivent ici.

-- name: InsertAncre :one
-- Archive un jeton RFC 3161 AVEC le certificat TSA : la preuve reste
-- vérifiable même si la TSA disparaît.
INSERT INTO public.registre_ancre (registre_seq, anchored_hash, tsa_url, hash_algorithm, token, tsa_cert)
VALUES (@registre_seq, @anchored_hash, @tsa_url, @hash_algorithm, @token, @tsa_cert)
RETURNING id;

-- name: ListAncres :many
-- Toutes les ancres : vérification en masse et repères temporels de l'écran
-- d'administration (ces dates viennent de la base et ne sont pas une preuve —
-- la preuve reste les témoins externes).
SELECT id, registre_seq, anchored_hash, tsa_url, hash_algorithm, token, tsa_cert, created_at
FROM public.registre_ancre
ORDER BY id;

-- name: GetAncresByRegistreSeq :many
-- Ancres existantes pour un maillon donné (idempotence d'AnchorLast).
SELECT id, tsa_url FROM public.registre_ancre WHERE registre_seq = @registre_seq;

-- name: GetAncreByID :one
-- Charge une ancre pour construire son témoin courriel.
SELECT id, registre_seq, anchored_hash, tsa_url, token, tsa_cert, created_at
FROM public.registre_ancre WHERE id = @id;

-- name: HasSentTemoin :one
-- Idempotence du témoin : un destinataire déjà SENT n'est pas recontacté.
SELECT EXISTS (
  SELECT 1 FROM public.registre_temoin
  WHERE ancre_id = @ancre_id AND recipient = @recipient AND status = 'SENT'
);

-- name: InsertTemoin :one
-- Trace chaque tentative d'envoi (SENT/FAILED) pour l'idempotence et le renvoi.
INSERT INTO public.registre_temoin (ancre_id, registre_seq, recipient, status, error)
VALUES (@ancre_id, @registre_seq, @recipient, @status, @error)
RETURNING id;

-- name: ListNotesByIds :many
-- État des notes visées par une suppression en masse, lu avant le DELETE.
SELECT n.id, n.note, n.remarque, n.user_id, n.controle_id, n.is_validated, n.not_evaluated
FROM public.note n
WHERE n.id = ANY(@ids::int[])
ORDER BY n.id;

-- name: ListNotesByUsers :many
-- État des notes des utilisateurs visés par un effacement (art. 17), lu avant
-- la destruction en cascade de la ligne user.
SELECT n.id, n.note, n.remarque, n.user_id, n.controle_id, n.is_validated, n.not_evaluated
FROM public.note n
WHERE n.user_id = ANY(@ids::int[])
ORDER BY n.id;

-- name: ListJuryResultsByUsers :many
-- Résultats de jury des utilisateurs visés par un effacement (art. 17), lus
-- avant la destruction en cascade de la ligne user.
SELECT jr.user_id, jr.periode_id, jr.unite_enseignement_id,
       jr.grade, jr.gpa_index, jr.ects, jr.compte_cumul
FROM public.jury_result jr
WHERE jr.user_id = ANY(@ids::int[])
ORDER BY jr.user_id, jr.periode_id, jr.unite_enseignement_id;

-- name: ListJuryResultsByUserPeriode :many
-- Résultats de jury détruits par une annulation de délibération, lus avant le
-- DELETE — un maillon jury.cancel par ligne, en miroir de la délibération.
SELECT jr.user_id, jr.periode_id, jr.unite_enseignement_id,
       jr.grade, jr.gpa_index, jr.ects, jr.compte_cumul
FROM public.jury_result jr
WHERE jr.user_id = @user_id AND jr.periode_id = @periode_id
ORDER BY jr.unite_enseignement_id;

-- name: ListNotesToPurge :many
-- Notes que la purge d'une opération de corbeille détruira par cascade : même
-- descente structurelle que PurgeImpact (corbeille), depuis les racines de
-- l'opération jusqu'aux contrôles. La descente est structurelle et non par
-- delete_op_id : la cascade physique emporte aussi les sous-arbres mis en
-- corbeille par une opération distincte.
WITH promotion_c AS (
    SELECT p.id FROM public.promotion p
    WHERE (@racine_type::text = 'formation' AND p.formation_id = ANY(@ids::int[]))
       OR (@racine_type::text = 'promotion' AND p.id = ANY(@ids::int[]))
),
option_c AS (
    SELECT o.id FROM public.option o
    WHERE o.promotion_id IN (SELECT id FROM promotion_c)
       OR (@racine_type::text = 'option' AND o.id = ANY(@ids::int[]))
),
periode_c AS (
    SELECT pe.id FROM public.periode pe
    WHERE pe.option_id IN (SELECT id FROM option_c)
       OR (@racine_type::text = 'periode' AND pe.id = ANY(@ids::int[]))
),
ue_c AS (
    SELECT ue.id FROM public.unite_enseignement ue WHERE ue.periode_id IN (SELECT id FROM periode_c)
),
matiere_c AS (
    SELECT m.id FROM public.matiere m WHERE m.unite_enseignement_id IN (SELECT id FROM ue_c)
),
controle_c AS (
    SELECT ct.id FROM public.controle ct WHERE ct.matiere_id IN (SELECT id FROM matiere_c)
)
SELECT n.id, n.note, n.remarque, n.user_id, n.controle_id, n.is_validated, n.not_evaluated
FROM public.note n
WHERE n.controle_id IN (SELECT id FROM controle_c)
ORDER BY n.id;
