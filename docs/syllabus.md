# Syllabus — fiche et livret PDF (lot 5)

Le domaine syllabus attache du contenu pédagogique aux entités de structure
— la fiche d'une matière, la description et la matrice de compétences d'une
UE, le référentiel de compétences d'une promotion — et en produit deux
documents : la **fiche d'une UE** et le **livret d'une promotion**. Ce
document dit comment ils se génèrent et s'exploitent ; l'import du contenu
tiers a son propre mode d'emploi (`docs/syllabus-import.md`), les décisions
de conception sont dans le CLAUDE.md (section « Syllabus »).

## 1. Ce que les documents rendent

La cible visuelle est la maquette validée au lot 0,
`docs/syllabus/fiche-maquette.html` (intouchée). Le gabarit serveur en est
dérivé (`back/pkg/syllabus/fiche_gabarit.html`, embarqué dans le binaire) :

- **page de l'UE** : bandeau (nom de l'UE, formation, période, année
  scolaire), chiffres clés (ECTS, enseignement encadré, travail personnel,
  nombre d'enseignements), « Pourquoi cette UE ? », éléments constitutifs
  (une ligne par matière : heures et coefficient, total de l'UE), matrice de
  compétences ;
- **une page par matière** : contexte et prérequis, volumes horaires avec
  leur total encadré, objectifs, activités, évaluation, plan de cours,
  ressources, dimension socio-environnementale.

Quatre règles, héritées de la maquette et des lots précédents :

1. **La structure fait référence.** Les heures des éléments constitutifs et
   le volume encadré de l'UE sont `matiere.heure` ; l'ECTS vient de l'UE ;
   la période et l'année scolaire viennent de la hiérarchie. La ventilation
   du syllabus ne s'affiche que sur la page de sa matière, et si son total
   encadré diffère de `matiere.heure`, la **ligne d'écart** le dit, dans les
   mêmes mots que l'écran : « Total encadré : X h — la structure prévoit
   Y h ». Jamais bloquant.
2. **Rien de vide ne s'imprime.** Rubrique nulle → pas de cadre ; ligne
   d'heures nulle → absente ; le responsable n'est pas rendu.
3. **La matrice se lit sans légende.** Les blocs mobilisés (au moins une
   marque sur une de leurs compétences) sont rendus entiers, pastilles sur
   trois colonnes Enseignée / Mise en œuvre / Évaluée, codes « C{ordre} »
   dérivés ; les autres blocs tiennent en une phrase.
4. **Aucune absence silencieuse.** Une UE sans liaison affiche « Aucune
   compétence n'est encore déclarée pour cette UE. » ; une matière sans
   fiche, « Aucune fiche syllabus n'est encore rédigée pour cet
   enseignement. » — sur un document qui circule, un blanc serait une
   information fausse.

Le **livret** enchaîne les fiches de toutes les UE d'une promotion — options
par nom, périodes par date de début, UE dans l'ordre de saisie — derrière une
page de titre (formation, promotion, années, sommaire). Il se génère par
promotion parce que la structure est dupliquée par promotion — et, depuis le
16 septembre 2026, le référentiel de compétences l'est aussi : la matrice
d'une fiche se lit sur le référentiel de la promotion de l'UE.

## 2. Deux langues

La fiche est bilingue **par ses libellés seulement** : titres de sections,
en-têtes de colonnes, ligne d'écart, phrases des points 3 et 4, existent en
français et en anglais côté serveur (`fiche_gabarit.go`, `libellesFr` /
`libellesEn`). Le **contenu saisi** — rubriques, noms d'UE et de matières,
libellés du référentiel — est rendu tel quel, dans sa langue de rédaction :
la fiche ne traduit pas les données. Le séparateur décimal suit la langue
(« 17,5 » / « 17.5 »).

La langue se demande par `?lang=fr|en` (défaut `fr`, toute autre valeur →
400 `INVALID_PARAM`). Le bouton et l'action de l'écran passent la langue
courante de l'interface ; le nom de fichier la porte (`…-fr.pdf`,
`…-en.pdf`) pour qu'une archive bilingue ne s'écrase pas.

## 3. Routes et écrans

| Document | Route | Rôle | Nom de fichier |
|---|---|---|---|
| Fiche d'une UE | `GET /api/v0/syllabus/ue/{ueID}/fiche?lang=` | CONSULTATION | `syllabus-ue-<nom de l'UE>-<lang>.pdf` |
| Livret d'une promotion | `GET /api/v0/syllabus/promotion/{promotionID}/livret?lang=` | CONSULTATION | `syllabus-livret-<nom de la promotion>-<lang>.pdf` |

Les noms passent par un *slug* (minuscules, ASCII, tirets : « E2E UE1 » →
`e2e-ue1`). Réponse `application/pdf` avec `Content-Length` : le document
est entier en mémoire avant le premier octet écrit — jamais de PDF tronqué.

Erreurs : entité inconnue ou dont la branche est en corbeille → `NOT_FOUND`
(enveloppe 400 du projet) ; service de conversion injoignable, en délai ou
en erreur → **503 `SERVICE_UNAVAILABLE`**, avec identifiant d'incident dans
la réponse et la cause dans le journal du backend. L'écran affiche le
message canonique du code (« Un service nécessaire est indisponible.
Réessayez plus tard. »).

À l'écran : le bouton « Télécharger la fiche PDF » à droite du titre de
l'écran syllabus de l'UE (`…/ue/:id/syllabus`), et l'action « Télécharger le
livret PDF » dans le menu de la ligne d'une promotion. Tous deux visibles en
CONSULTATION — ce sont des lectures.

## 4. Le service de conversion (Gotenberg)

La conversion HTML → PDF est faite par **Gotenberg** (Chromium piloté par
une API HTTP), conteneur `pdf-service` de `infra/container/compose.yaml`,
image épinglée, sur le réseau Docker (`10.20.2.7:3000`), jamais publié sur
l'hôte. Il est démarré par les chaînes `make start-local-*`, `start-dev*` et
`start-prod-*` (`_pdf-up`, avec attente de son *healthcheck*) — le backend
ne démarre jamais devant un service PDF qui n'écoute pas encore. Options du
conteneur : JavaScript désactivé et routes LibreOffice fermées — les
documents envoyés sont des HTML autonomes (feuille de style en ligne, aucune
ressource externe), rien d'autre n'a l'usage.

Côté backend, le client vit dans `back/pkg/services/pdf.go`
(`ConvertisseurPDF`, bibliothèque standard seule : un POST multipart sur
`/forms/chromium/convert/html`, format A4 sans marge — le gabarit porte les
siennes). Il est **mutualisé** : la fiche syllabus est son premier
consommateur, les bulletins de jury le suivront. Configuration dans le bloc
`pdf` de `back/cmd/serveur/config.yaml` :

| Clé | Valeur | D'où |
|---|---|---|
| `url` | `http://${GOTENBERG_HOST}:3000` | `GOTENBERG_HOST` des `config-*.env` |
| `timeout` | `25s` | littéral, sous le `writeTimeout` du serveur (30 s) ; borne la conversion entière |
| `timeout_connexion` | `2s` | littéral ; ne borne que l'ouverture de la connexion TCP — service arrêté, 503 en 2 s au lieu de 25 (17 septembre 2026) |
| `etablissement` | `IMT Mines Alès` | littéral, la marque du pied de page |

Volumes mesurés le 15 septembre 2026, sur le poste (démonstration INFRES,
structure `demo-infres.sql` puis import du legacy) : une fiche de 4 pages
(UE à trois matières) ≈ 65 ko en 150 ms côté serveur, 230 ms au clic ; le
livret de la promotion (8 UE, 20 matières, 29 pages logiques, 36 pages
physiques) ≈ 266 ko en 280 ms côté serveur, 480 ms au clic. Le délai de
25 s laisse deux ordres de grandeur pour une formation entière.

Limite constatée : « une matière = une page » tient tant que le contenu
tient ; au-delà, la suite coule sur la page suivante, pied compris, et la
numérotation « page n/N » reste logique (sept matières aux rubriques
longues expliquent les sept pages physiques de plus du livret de
démonstration).

Service arrêté : `docker stop gotenberg` reproduit le 503 à l'écran ; `make
start-local-keep` le relance.

## 5. Vérifier

- **Gabarit** : `go test ./pkg/syllabus/ -run Gabarit` — sans base ni
  service, les assertions sur le HTML (sections, rubriques vides absentes,
  ligne d'écart, heures de référence, blocs mobilisés, phrases, deux langues,
  sommaire du livret).
- **Client** : `go test ./pkg/services/ -run Convertisseur` — contre un
  serveur HTTP de test.
- **Intégration** (base `scolarite_tu` et Gotenberg réel, `t.Skip` sinon) :
  `TEST_DB_URL=… go test -p 1 -run 'Integration_(FichePDF|LivretPDF)'
  ./pkg/syllabus/` — en-tête `%PDF`, taille plancher, type de contenu, noms
  de fichiers, 503 sur un port fermé, NOT_FOUND sur une branche en corbeille.
- **Suite e2e** : `fiche-pdf.spec.ts` — le bouton et l'action déclenchent un
  téléchargement (événement, nom, en-tête `%PDF`), sans ouvrir le document.
- **À l'œil** : `pdftoppm -png -r 60 fiche.pdf page` puis regarder les
  images — c'est ainsi que la conformité à la maquette a été vérifiée page à
  page à la livraison du lot.
