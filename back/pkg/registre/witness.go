package registre

// Témoin externe — après chaque ancrage RFC 3161 réussi, la tête de chaîne
// (seq + hash + jeton + certificat TSA) est envoyée par e-mail vers une boîte
// externe contrôlée par un tiers. Une chaîne réécrite puis ré-ancrée en base ne
// pourra pas correspondre aux témoins déjà reçus : le dispositif garantit la
// DÉTECTABILITÉ d'une altération par un initié, pas son impossibilité.
//
// Provenance : rex-imt (backend/admin/pkg/presence/witness.go), porté à
// l'identique — tables registre_ancre/registre_temoin, logs en slog, texte du
// courriel adapté au registre des notes et délibérations.
//
// Deux exigences de déploiement, non vérifiables par le code (docs/rgpd-registre.md) :
//   - la boîte destinataire est gérée par un rôle distinct de l'admin infra ;
//   - le compte SMTP de l'application n'a qu'un droit d'envoi.
//
// RGPD : le témoin ne contient que registre_seq, hash, date et URL TSA —
// aucune donnée personnelle d'élève.

import (
	"context"
	"cyb-react/pkg/mailer"
	"cyb-react/pkg/registre/gen"
	"cyb-react/pkg/services"
	"fmt"
	"log/slog"
	"time"
)

// Witness porte les éléments du témoin de tête de chaîne.
type Witness struct {
	AnchorID   int64
	Seq        int64
	Hash       string // hex SHA-256 (64 caractères)
	AnchoredAt time.Time
	TSAURL     string
	Token      []byte // jeton RFC 3161 brut (RawToken)
	TSACertPEM []byte // certificat(s) TSA au format PEM
}

// WitnessSendReport résume une passe d'envoi pour une ancre.
type WitnessSendReport struct {
	AnchorID int64 `json:"anchorId"`
	Sent     int   `json:"sent"`
	Skipped  int   `json:"skipped"` // déjà SENT (idempotence)
	Failed   int   `json:"failed"`
}

// witnessEnabled indique si la config permet un envoi (sinon l'ancrage
// fonctionne normalement et l'envoi est simplement ignoré).
func witnessEnabled(cfg services.WitnessConfig) bool {
	return cfg.Enabled && len(cfg.Recipients) > 0 && cfg.SMTP.Host != ""
}

// buildWitnessMessage construit l'e-mail témoin : corps texte lisible
// (seq, hash, date UTC, TSA) et pièces jointes autoportantes (jeton + cert).
func buildWitnessMessage(from, to string, w Witness) mailer.Message {
	body := fmt.Sprintf(`Témoin d'ancrage du registre des notes et délibérations

Ce message est une preuve d'archivage : conservez-le, il atteste de l'état
du registre à la date indiquée et permet de détecter toute réécriture
ultérieure de la chaîne.

Maillon de tête ancré (registre_seq) : %d
Empreinte SHA-256 (anchored_hash)    : %s
Date de l'ancrage (UTC)              : %s
Autorité d'horodatage (TSA)          : %s

Pièces jointes :
  - anchor-%d.tsr : jeton d'horodatage RFC 3161 brut
  - tsa-cert.pem  : certificat de la TSA (vérification possible même si la TSA disparaît)

Vérification future : le jeton horodate exactement l'empreinte ci-dessus ;
toute divergence avec le contenu de la base signale une altération.
`, w.Seq, w.Hash, w.AnchoredAt.UTC().Format(time.RFC3339), w.TSAURL, w.Seq)

	msg := mailer.Message{
		From:    from,
		To:      []string{to},
		Subject: fmt.Sprintf("[Scolarité] Témoin d'ancrage du registre — seq %d — %s", w.Seq, w.AnchoredAt.UTC().Format("2006-01-02")),
		Body:    body,
		Attachments: []mailer.Attachment{
			{
				Filename:    fmt.Sprintf("anchor-%d.tsr", w.Seq),
				ContentType: "application/timestamp-reply",
				Data:        w.Token,
			},
		},
	}
	if len(w.TSACertPEM) > 0 {
		msg.Attachments = append(msg.Attachments, mailer.Attachment{
			Filename:    "tsa-cert.pem",
			ContentType: "application/x-pem-file",
			Data:        w.TSACertPEM,
		})
	}
	return msg
}

// SendWitnessForAnchor envoie le témoin d'une ancre à chaque destinataire
// configuré, avec idempotence par (ancre_id, recipient) : un destinataire
// déjà SENT n'est pas recontacté. Chaque tentative est tracée dans
// registre_temoin (SENT/FAILED).
func SendWitnessForAnchor(ctx context.Context, db DBTX, cfg services.WitnessConfig, anchorID int64) (WitnessSendReport, error) {
	report := WitnessSendReport{AnchorID: anchorID}
	if !witnessEnabled(cfg) {
		slog.Info("[witness] envoi désactivé ou SMTP non configuré, témoin ignoré", "ancre", anchorID)
		return report, nil
	}

	q := gen.New(db)
	anchor, err := q.GetAncreByID(ctx, anchorID)
	if err != nil {
		return report, fmt.Errorf("witness load anchor %d: %w", anchorID, err)
	}

	w := Witness{
		AnchorID:   anchor.ID,
		Seq:        anchor.RegistreSeq,
		Hash:       anchor.AnchoredHash,
		AnchoredAt: anchor.CreatedAt.Time,
		TSAURL:     anchor.TsaUrl,
		Token:      anchor.Token,
		TSACertPEM: anchor.TsaCert,
	}

	for _, recipient := range cfg.Recipients {
		if recipient == "" {
			continue // var d'env de destinataire non définie
		}
		sent, err := q.HasSentTemoin(ctx, gen.HasSentTemoinParams{AncreID: anchorID, Recipient: recipient})
		if err != nil {
			return report, fmt.Errorf("witness check sent (anchor %d): %w", anchorID, err)
		}
		if sent {
			report.Skipped++
			continue
		}

		msg := buildWitnessMessage(cfg.SMTP.From, recipient, w)
		sendErr := mailer.Send(ctx, cfg.SMTP, msg)

		status := "SENT"
		var errText *string
		if sendErr != nil {
			status = "FAILED"
			s := sendErr.Error()
			errText = &s
			report.Failed++
			slog.Error("[witness] échec envoi témoin",
				"ancre", anchorID, "seq", w.Seq, "recipient", recipient, "err", sendErr)
		} else {
			report.Sent++
			slog.Info("[witness] témoin envoyé", "ancre", anchorID, "seq", w.Seq, "recipient", recipient)
		}

		if _, err := q.InsertTemoin(ctx, gen.InsertTemoinParams{
			AncreID:     anchorID,
			RegistreSeq: w.Seq,
			Recipient:   recipient,
			Status:      status,
			Error:       errText,
		}); err != nil {
			return report, fmt.Errorf("witness record (anchor %d): %w", anchorID, err)
		}
	}
	return report, nil
}

// SendWitnesses déclenche l'envoi du témoin pour chaque ancre NOUVELLEMENT
// créée par AnchorLast (Created). Les ancres déjà existantes ne génèrent aucun
// e-mail : si la tête de chaîne n'a pas bougé, il n'y a rien de neuf à archiver.
// Un échec d'envoi ne remonte jamais : l'ancre en base reste valide, l'erreur
// est loguée et tracée en FAILED pour renvoi ultérieur.
func SendWitnesses(ctx context.Context, db DBTX, cfg services.WitnessConfig, results []AnchorResult) {
	if !witnessEnabled(cfg) {
		return
	}
	for _, res := range results {
		if res.Err != nil || !res.Created {
			continue
		}
		if _, err := SendWitnessForAnchor(ctx, db, cfg, res.AnchorID); err != nil {
			slog.Error("[witness] erreur témoin", "ancre", res.AnchorID, "err", err)
		}
	}
}
