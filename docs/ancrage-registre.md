# Ancrage externe du registre des notes — RFC 3161 et témoins

## Objet du document

Décrit le dispositif d'**ancrage externe** du registre chaîné : toutes les
heures, le dernier hash de la chaîne des notes et délibérations est scellé
auprès d'une autorité d'horodatage (TSA), puis envoyé par courriel vers une
boîte témoin externe. Ce document précise le rôle de chaque étage dans le
modèle de menace, le fonctionnement opérationnel (configuration, commandes,
écran), la vérification d'un témoin, et les limites exactes de la garantie.

Le volet données personnelles (ce qui sort de l'établissement, et pourquoi
c'est licite) est traité dans [rgpd-registre.md](rgpd-registre.md).
L'implémentation est un portage à l'identique de rex-imt
(`backend/admin/pkg/presence/`), adapté au registre généralisé.

---

## 1. Les trois étages, et ce que chacun prouve

Le registre (`registre`) trace toute création, modification ou destruction
d'une note ou d'un résultat de jury, chaque maillon incluant le hash SHA-256
du précédent. Ce chaînage seul a une limite précise : il prouve qu'on ne peut
pas modifier *un* maillon sans casser la chaîne — il ne prouve pas que la
chaîne *entière* n'a pas été réécrite.

| Étage | Table | Ce qu'il ferme |
|---|---|---|
| Chaînage SHA-256 | `registre` | L'altération d'un maillon isolé : tout recalcul (`VerifierChaine`) la détecte. |
| Ancre RFC 3161 | `registre_ancre` | L'antidatage : la TSA certifie qu'un hash de tête existait à une date T. Le jeton **et** le certificat TSA sont archivés ensemble — la preuve reste vérifiable même si la TSA disparaît. |
| Témoin courriel | `registre_temoin` (suivi d'envoi) | L'initié : la preuve part chez un tiers que l'initié ne contrôle pas. |

Le scénario que seul le témoin ferme : un administrateur de la base réécrit la
chaîne entière (une note changée, tous les hashes recalculés), supprime les
ancres, et ré-ancre la chaîne falsifiée auprès de la TSA. Tout est cohérent en
base — mais les témoins déjà reçus chez le tiers portent des hashes que la
chaîne réécrite **ne peut pas reproduire**. Le courriel bénéficie en outre de
l'horodatage propre du serveur de messagerie destinataire, indépendant de
notre infrastructure.

> **Le dispositif garantit la détectabilité d'une altération, pas son
> impossibilité.** Un initié peut toujours réécrire la base ; il ne peut pas
> faire coïncider le résultat avec les témoins archivés chez un tiers.

## 2. Ce qui quitte l'établissement

- **Vers la TSA** : l'empreinte SHA-256 du maillon de tête — 32 octets dont
  rien n'est déductible.
- **Dans le témoin courriel** : `registre_seq`, `anchored_hash`, la date
  d'ancrage UTC, l'URL de la TSA, et deux pièces jointes autoportantes :
  `anchor-<seq>.tsr` (jeton RFC 3161 brut) et `tsa-cert.pem` (certificat TSA).

Aucun nom, aucune note, aucun identifiant d'élève — verrouillé par un test
(`TestBuildWitnessMessage_NoPII`). Le témoin est **autoportant** : jeton +
certificat + seq + hash + date suffisent à une vérification future sans
dépendre ni de la TSA ni de la base.

## 3. Fonctionnement

### L'ordonnanceur

`registre.StartAnchorScheduler` (démarré dans `back/cmd/serveur/main.go`)
tourne **toutes les heures**, avec une première passe au démarrage :
`AnchorLast` puis envoi du témoin pour chaque ancre **nouvellement créée**.

La garde centrale est l'idempotence par couple (`registre_seq`, `tsa_url`) :
**tête de chaîne inchangée ⇒ aucune ancre, aucune requête TSA, aucun
courriel**. Un ordonnanceur silencieux sur un registre qui ne bouge pas n'est
pas une panne, c'est le comportement voulu.

### L'invariant : l'ancrage observe, il ne gouverne pas

Aucun échec de cet étage — TSA injoignable, timeout, jeton invalide, SMTP en
panne — ne bloque jamais une écriture de note ou de jury. L'ordonnanceur est
une goroutine indépendante ; `AppendNote` et `AppendJury` ne l'appellent
jamais. Concrètement :

- un échec TSA est porté par le résultat du passage, logué en erreur, et
  affiché à l'écran Registre quand l'ancrage est manuel ;
- un échec SMTP ne fait pas échouer l'ancre : elle reste valide en base, la
  tentative est tracée `FAILED` dans `registre_temoin` et peut être rejouée
  (`POST /api/v0/registre/temoin/renvoi/{ancreID}`) ;
- si le témoin est désactivé ou le SMTP non configuré, l'ancrage fonctionne
  normalement et l'envoi est simplement ignoré (log d'information).

### Configuration

Bloc `registre:` de `back/cmd/serveur/config.yaml` (source unique), valeurs
par environnement dans `infra/env/config-<env>.env`, secrets dans
`secrets-<env>.env` :

```yaml
registre:
  timestamp:
    enabled: ${REGISTRE_ANCRAGE_ENABLED}     # vide vaut false
    urls:
      - https://freetsa.org/tsr              # ajouter d'autres TSA pour redondance
    hashAlgorithm: sha256
    timeout: 10s
    caCertPath: ${REGISTRE_TSA_CA_CERT}      # cert racine, voir ci-dessous
  witness:
    enabled: ${REGISTRE_TEMOIN_ENABLED}
    recipients:
      - ${REGISTRE_TEMOIN_RECIPIENT}         # boîte contrôlée par un TIERS
    smtp:
      host: ${REGISTRE_SMTP_HOST}            # [DEV-LOCAL] Mailpit : ni AUTH ni STARTTLS
      port: ${REGISTRE_SMTP_PORT}
      username: ${REGISTRE_SMTP_USER}        # vide = aucune authentification tentée
      password: ${REGISTRE_SMTP_PASSWORD}    # secrets-<env>.env
      from: ${REGISTRE_SMTP_FROM}
      startTLS: ${REGISTRE_SMTP_STARTTLS}
      timeout: 10s
```

En local, l'ancrage vise la vraie FreeTSA et le témoin part vers Mailpit
(`http://localhost:8025`) sur une adresse fictive : la chaîne technique
complète se rode sans que rien ne quitte la machine. En production, tout est
désactivé tant que la TSA retenue et la boîte témoin gouvernée ne sont pas
décidées.

### Le certificat racine de la TSA

Son obtention est un **acte volontaire** — c'est une racine de confiance,
jamais commitée, jamais téléchargée silencieusement au démarrage :

```sh
make fetch-freetsa-cert
```

La cible affiche l'empreinte SHA-256, à confronter à https://freetsa.org
avant de s'y fier. S'il manque au démarrage alors que l'ancrage est actif, le
serveur démarre et le signale en erreur dans les logs — la vérification hors
ligne des témoins échouera tant qu'il n'est pas en place. En conteneur,
`start-scolarite.sh` copie le fichier dans le répertoire de conf monté (même
mécanisme que la CA mkcert).

### Déclencher un passage sans attendre le ticker

```sh
make ancrer
```

Petit binaire dédié (`back/cmd/ancrage`), même configuration que le serveur,
même garde d'idempotence. Sortie : `✓` nouvelle ancre, `=` tête déjà ancrée,
`✗` échec avec motif. Le bouton « Ancrer maintenant » de l'écran Registre
fait la même chose par l'API (`POST /api/v0/registre/ancrage`).

## 4. Vérifier un témoin : l'écran Registre

Entrée **Registre** du menu latéral (`/registre`), réservée au composite
ADMIN (tous les rôles fonctionnels exigés, comme la corbeille). Trois cartes :
l'intégrité de la chaîne (recalcul complet), l'état de l'ancrage (date de la
dernière ancre réussie — ces dates viennent de la base et sont des **repères,
pas des preuves**), et le dépôt d'un témoin.

L'auditeur y dépose **un seul témoin** : la pièce jointe `anchor-<seq>.tsr`
reçue par courriel, téléversée telle quelle ou collée (base64 avec sauts de
ligne, PEM — le décodage est tolérant), éventuellement accompagnée du
certificat `tsa-cert.pem`. À défaut de certificat collé, le certificat racine
configuré (`caCertPath`) sert de point de confiance.

> **Provenance du témoin** : la preuve vient de la confrontation de **deux
> sources indépendantes** — le témoin détenu par le tiers et la base. Il faut
> déposer le jeton **reçu par courriel**, jamais un jeton rechargé depuis la
> base, qui ne prouverait que la cohérence de la base avec elle-même.

### Pourquoi un seul témoin suffit

1. Le jeton, signature CMS et chaîne de certification validées, prouve qu'un
   **hash de tête H existait à une date T** certifiée par la TSA.
2. Si H figure encore dans `registre.hash` (maillon N), la chaîne actuelle
   reproduit l'état scellé ; sinon, elle a été réécrite après T.
3. `VerifierChaine` confirme en complément la cohérence interne du chaînage
   jusqu'à N.

### Sens des verdicts

| Verdict | Signification |
|---|---|
| `CONFORME` | Chaîne conforme jusqu'au maillon N, scellé le T par la TSA. Tout ce qui précède ce point est authentifié. |
| `REECRITURE_DETECTEE` | Le hash certifié le T est **absent** de la chaîne actuelle : les données ont été modifiées après cette date (altération d'un maillon ≤ N). |
| `CHAINE_CORROMPUE` | Le hash scellé existe encore, mais le chaînage interne est rompu **avant** lui (le `seq` de rupture est affiché). |
| `TOKEN_INVALIDE` | Jeton illisible (copier-coller incomplet, fichier altéré ou mauvais fichier). Témoin non exploitable. |
| `SIGNATURE_INVALIDE` | La chaîne de certification TSA ne remonte pas au certificat de confiance : témoin **non probant**. |

La vérification est **en lecture seule** : aucun témoin déposé n'est conservé,
rien n'est écrit en base.

### Localiser une altération par dichotomie (manuelle)

L'écran traite volontairement un témoin à la fois ; la dichotomie est pilotée
par l'auditeur, qui détient les témoins externes :

1. tester le témoin le plus récent ; conforme ⇒ chaîne intègre jusqu'à sa
   date ;
2. verdict négatif ⇒ tester un témoin plus ancien : s'il est conforme,
   l'altération se situe **entre les deux dates certifiées** ;
3. répéter en resserrant l'intervalle — la date certifiée (`sealedAt`),
   affichée même sur un verdict négatif, situe chaque test sur la frise.

La liste des ancres en base (`GET /api/v0/registre/ancres`) donne les
intervalles à titre de repère seulement.

## 5. Exigences de déploiement (impératives, non vérifiables par le code)

Le dispositif n'a de valeur anti-initié que si deux conditions
organisationnelles sont réunies — le code ne peut pas les garantir :

1. **Séparation des pouvoirs** : la boîte destinataire
   (`registre.witness.recipients`) est contrôlée par une personne ou un rôle
   **distinct** de ceux qui détiennent les accès base/infrastructure (DPO,
   direction des études, boîte institutionnelle d'un autre établissement…).
   Un initié qui pourrait purger la boîte annulerait le dispositif.
2. **Accès d'envoi uniquement** : le compte SMTP configuré n'a **que le droit
   d'envoyer** — aucun droit de lecture, de modification ou de suppression
   sur la boîte destinataire.

## 6. Limite de la garantie : la fenêtre non couverte

Un témoin prouve la conformité de la chaîne **jusqu'au maillon scellé, à la
date certifiée**. Au-delà du dernier témoin reçu, seul le chaînage interne
garantit l'intégrité. Cette fenêtre est bornée par la fréquence d'ancrage :
une heure au plus après une écriture, la nouvelle tête est ancrée et
témoignée — et `make ancrer` la referme à la demande (veille de jury, fin de
délibération).

---

*Document — Août 2026 — scolarite. Implémentation : portage rex-imt
(`docs/temoin-externe.md` y est le document frère, côté pointages).*
