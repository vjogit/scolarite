-- name: CreateReservation :one
INSERT INTO reservation (horaire, periode_id, matiere_id, type_cours, is_distanciel, description)
VALUES (@horaire, @periode_id, @matiere_id, @type_cours, @is_distanciel, @description)
RETURNING id;

-- name: UpdateReservation :one
UPDATE reservation
SET horaire       = @horaire,
    periode_id    = @periode_id,
    matiere_id    = @matiere_id,
    type_cours    = @type_cours,
    is_distanciel = @is_distanciel,
    description   = @description,
    version       = version + 1
WHERE id = @id AND version = @version
RETURNING version;

-- name: DeleteReservation :exec
DELETE FROM reservation WHERE id = ANY(@ids::int[]);

-- ── Associations salles ──────────────────────────────────────────────────────

-- name: AddReservationSalle :exec
-- Le trigger sync_reservation_horaire peuple automatiquement la colonne horaire
-- La contrainte sans_conflit_salle lève une erreur si chevauchement
INSERT INTO reservation_salle (reservation_id, salle_id,horaire)
VALUES (@reservation_id, @salle_id, @horaire);

-- name: DeleteReservationSalles :exec
DELETE FROM reservation_salle WHERE reservation_id = @reservation_id;

-- ── Associations intervenants ────────────────────────────────────────────────

-- name: AddReservationIntervenant :exec
-- Le trigger sync_reservation_horaire peuple automatiquement la colonne horaire
-- La contrainte sans_conflit_intervenant lève une erreur si chevauchement
INSERT INTO reservation_intervenant (reservation_id, user_id,horaire)
VALUES (@reservation_id, @user_id, @horaire);

-- name: DeleteReservationIntervenants :exec
DELETE FROM reservation_intervenant WHERE reservation_id = @reservation_id;

-- ── Associations groupes ─────────────────────────────────────────────────────

-- name: AddReservationGroupe :exec
-- Le trigger sync_reservation_horaire peuple automatiquement la colonne horaire
INSERT INTO reservation_groupe (reservation_id, groupe_id,horaire)
VALUES (@reservation_id, @groupe_id, @horaire);

-- name: DeleteReservationGroupes :exec
DELETE FROM reservation_groupe WHERE reservation_id = @reservation_id;
