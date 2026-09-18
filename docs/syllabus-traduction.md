# Traduction du contenu syllabus — mode d'emploi (lot 6)

Le contenu pédagogique se rédige en français ; les étudiants étrangers lisent
la fiche et le livret PDF en anglais. Ce document dit comment produire et
entretenir la traduction anglaise — par l'écran, fiche par fiche, ou par
campagne en ligne de commande. Les décisions de conception sont dans le
CLAUDE.md (section « Syllabus », sous-section « Traduction du contenu ») ;
les documents eux-mêmes ont leur mode d'emploi (`docs/syllabus.md`).

**Le français fait référence.** La traduction est un dérivé stocké, jamais
une seconde source : elle porte l'empreinte des textes français dont elle
est tirée, et devient **périmée** quand ces textes changent. Périmée n'est
jamais bloquant — l'écran le signale, le PDF le mentionne, rien n'est refusé
et rien n'est effacé.

**La machine propose, le rédacteur dispose.** Une traduction automatique
porte le statut `automatique` ; la relecture humaine la passe en `relue`.
Retraduire fait perdre « relue » : l'écran le confirme, la campagne s'en
abstient par défaut.

Ce que l'outil ne fait jamais : traduire les compétences du référentiel
(textes réglementaires France Compétences, laissés en français sur la fiche
anglaise) ; traduire à la volée au moment de générer un PDF ; écrire une
traduction dont la sortie du modèle est douteuse (garde-fous, §5) ; écraser
une relecture sans qu'on le lui demande.

## 1. Prérequis

- La stack locale tourne (`make start-local-keep`) ; l'outil se connecte à
  la base avec la configuration du serveur, comme `make ancrer`.
- Le contenu français est saisi et **enregistré** : la traduction part du
  texte en base, pas de la saisie en cours.
- Un fournisseur de modèle de langage est configuré (§2). Sans lui, tout le
  reste du domaine fonctionne : le bouton « Traduire automatiquement » n'est
  simplement pas offert, et la relecture à la main reste possible.

## 2. Configurer le traducteur

Le modèle est interchangeable : un connecteur par fournisseur derrière une
interface commune (`back/pkg/ia`, motif porté du projet `rex-imt`). Changer
de fournisseur ou de modèle est un changement de **configuration**.

| Où | Quoi |
|---|---|
| `infra/env/config-<env>.env` | `IA_PROVIDER` : `rack` (prod), `factice` (local et CI), vide (pas de traduction automatique). |
| `infra/env/secrets-<env>.env` | `RACK_API_KEY` — jamais dans le dépôt. Requise seulement pour `rack`. |
| `back/cmd/serveur/config.yaml`, bloc `ia` | Délais : `timeout` (campagne), `timeout_interactif` (bouton de l'écran, sous le `writeTimeout` du serveur et le `proxy_read_timeout` de nginx), `timeout_connexion` (ouverture TCP). |
| `back/cmd/serveur/config.yaml`, bloc `rack` | `base_url`, `model` — littéraux, mêmes valeurs dans tous les environnements. |

`factice` est **spécifique développement**, comme Mailpit : aucun appel
réseau, il rend le texte préfixé de « [en] ». C'est lui que la suite e2e
exerce — la CI n'appelle jamais un modèle réel.

Le certificat HTTPS du rack est auto-signé et sa vérification est désactivée
**pour ce fournisseur seulement** (assomption documentée en tête de
`back/pkg/ia/rack/rack.go`). Ne jamais recopier ce transport pour un
endpoint public.

## 3. Traduire à l'écran

Sous la fiche d'une matière et sous le syllabus d'une UE, le panneau
« Traduction anglaise » montre, pour chaque champ qui a un texte français
enregistré, la source à gauche et la traduction à droite. Sous
`SYLLABUS_ECRITURE` :

- **« Traduire automatiquement »** demande une proposition au modèle, champ
  par champ, puis enregistre le tout en `automatique`. Un échec en cours de
  route n'écrit rien. Sur une traduction existante, un dialogue confirme le
  remplacement — et dit que « relue » se perdra.
- **« Enregistrer comme relue »** écrit les textes du panneau en `relue`,
  contre la source affichée. C'est aussi le geste qui **guérit une
  péremption** : relire contre le texte français courant remet la traduction
  à jour.
- Une saisie française non enregistrée désactive « Traduire » : la
  traduction part du texte enregistré, la ligne sous le bouton le dit.

La ligne d'état (`role="status"`) dit le statut, le modèle, la date, et la
péremption le cas échéant. Sans le rôle d'écriture : lecture seule, aucun
bouton.

## 4. Traduire par campagne

`make traduire-syllabus SYLLABUS_TRANSLATE_ARGS="--promotion <id>"` — une
promotion entière, dans l'ordre du livret (options par nom, périodes par
date, UE par identifiant, matières par identifiant).

```bash
# Simulation : le traducteur est appelé, RIEN n'est écrit. Produit le rapport
# et le comparatif — c'est ainsi qu'on juge un modèle avant de l'adopter.
make traduire-syllabus SYLLABUS_TRANSLATE_ARGS="--promotion 12 --provider rack --limite 10"

# Application.
make traduire-syllabus SYLLABUS_TRANSLATE_ARGS="--promotion 12 --provider rack --apply"
```

| Option | Effet |
|---|---|
| `--promotion <id>` | **Obligatoire.** L'identifiant de la promotion, celui de son URL dans l'application. |
| `--apply` | Écrire en base. Sans lui : simulation complète. |
| `--provider` | Force le fournisseur (défaut : `ia.provider`). C'est ainsi qu'on demande `rack` depuis un poste réglé sur `factice`. |
| `--limite n` | Borne le nombre d'objets envoyés au modèle ; le reste est rapporté « non tentée ». Pour un essai. |
| `--retraduire-relues` | Retraduit aussi les traductions **relues** devenues périmées. Assume la perte du statut. |
| `--langue` | `en` (seule langue admise à ce jour). |
| `--sortie` | Dossier du rapport et du comparatif (défaut `back/cmd/syllabus-translate/data/`, ignoré par git). |

**Idempotence** : une traduction dont l'empreinte est celle de la source
courante est « à jour » et n'est pas retraduite — relancer ne coûte que ce
qui a changé. Une traduction `automatique` périmée est retraduite ; une
traduction `relue` périmée est **laissée** et listée en fin de rapport, à
reprendre à l'écran (ou avec `--retraduire-relues`).

**Continuer et rapporter** : un échec sur une fiche n'arrête pas la
campagne, et une fiche en échec n'est jamais écrite à moitié (une rubrique
refusée = la fiche entière non écrite). Après **trois échecs consécutifs**
du fournisseur, le disjoncteur s'ouvre : le reste est rapporté « non
tentée » plutôt que d'attendre un rack éteint pendant des heures. La sortie
n'est jamais tronquée — le rapport dit tout.

Deux fichiers horodatés sont écrits dans `--sortie` :

- `rapport-<mode>-<horodatage>.txt` : les compteurs (traduites,
  retraduites, à jour, sans texte, relues périmées laissées, échecs, non
  tentées), puis les listes — relues périmées, échecs par cause, non
  tentées. Identique en simulation et en application, seul l'en-tête
  diffère.
- `comparatif-<mode>-<horodatage>.md` : source et traduction **côte à
  côte**, rubrique par rubrique. C'est le document à lire pour juger la
  qualité d'un modèle.

Le code de sortie vaut 1 s'il y a eu au moins un échec.

## 5. La consigne, le glossaire, les garde-fous

La consigne système et le glossaire sont **versionnés dans le dépôt**
(`back/pkg/syllabus/traduction/consigne.txt` et `glossaire.csv`, embarqués
dans le binaire), pas dans la configuration : la même entrée doit produire
la même sortie d'une machine à l'autre. La consigne impose le registre
académique impersonnel, l'anglais britannique, la **mise en page conservée**
(paragraphes, lignes vides, puces — le gabarit PDF en dépend), les nombres,
unités, sigles, noms propres et références laissés tels quels, et rien
d'ajouté ni d'omis. Le glossaire impose le vocabulaire de l'école (UE →
*teaching unit*, TP → *lab session*, contrôle continu → *continuous
assessment*…) et part en entier à chaque appel. Un appel par champ, en texte
brut, température zéro.

Trois garde-fous refusent une sortie **avant** toute écriture : sortie vide ;
longueur hors du rapport 0,3–3 par rapport à la source (au-delà de 40
caractères — sous ce plancher le rapport ne dit rien) ; nombre de lignes à
puce différent de la source. Une sortie refusée est un échec rapporté, pas
un texte enregistré.

## 6. Ce que les documents PDF servent

En anglais (`?lang=en`), chaque champ est servi par sa traduction quand elle
existe, par le français sinon — **repli par champ**, jamais d'erreur. Une
ligne discrète dit ce qui est servi, dans l'esprit « aucune absence n'est
silencieuse » :

| État | Mention |
|---|---|
| Relue et à jour | *(aucune)* |
| Automatique, à jour | Machine translation, not yet reviewed — the French original prevails. |
| Périmée (quel que soit le statut) | Translation of an earlier version of the French original (translated on *date*) — the French original prevails. |
| Jamais traduite | Not yet translated — shown in the French original. |

La fiche française, elle, ne change pas : elle ignore les traductions.

## 7. Vérifier

- **Consigne et garde-fous** : `go test ./pkg/syllabus/traduction/` — sans
  base ni réseau.
- **Client du fournisseur** : `go test ./pkg/ia/...` — contre un serveur
  HTTP de test (route, message système, température, clé, défaillances).
- **Gabarit PDF** : `go test ./pkg/syllabus/ -run FicheTraduite` — la
  traduction servie, le repli par champ, les quatre mentions.
- **Intégration** (base `scolarite_tu`, connecteur factice) :
  `make test-integration GO_TEST_ARGS="-run 'Traduction|Campagne'"` — cycle
  complet, péremption par l'empreinte et non par la version, 503 d'un
  fournisseur en panne, idempotence, disjoncteur.
- **Suite e2e** : `traduction.spec.ts` — le panneau sous les deux écrans,
  la traduction, la relecture, la péremption, la confirmation de
  remplacement.
- **À l'œil**, pour un modèle réel : une campagne en simulation avec
  `--limite 10`, puis lire le comparatif.
