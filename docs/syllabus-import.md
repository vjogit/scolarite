# Import du syllabus tiers — mode d'emploi (lot 4)

Outil d'exploitation, en ligne de commande : `back/cmd/syllabus-import`.
Il importe le contenu du système syllabus tiers dans l'application — les
fiches des matières (huit rubriques, ventilation horaire), la description
des UE et les matrices UE ↔ compétence — à partir de l'export à plat en
CSV. Les décisions de conception sont dans le CLAUDE.md (section
« Syllabus », lot 4) ; ce document dit comment s'en servir.

Ce que l'outil ne fait jamais : créer ou modifier une formation, une
promotion, une option, une période, une UE ou une matière (la structure
fait référence — ce qui ne s'apparie pas est rejeté et rapporté) ; importer
un responsable ; importer le référentiel de compétences (saisi à l'écran,
lot 3) ; écrire quoi que ce soit sans `--apply`.

## 1. Prérequis

- La stack locale tourne (`make start-local-keep`) ; l'outil se connecte à
  la base avec la configuration du serveur, comme `make ancrer`.
- La structure cible est saisie : les périodes, UE et matières que
  l'import doit remplir existent déjà, avec leurs noms définitifs.
- Le référentiel de compétences de chaque **promotion** concernée est saisi
  (blocs et compétences, dans l'ordre du document France Compétences) : la
  matrice ne se lie qu'à des compétences existantes, et seulement à celles
  de la promotion de l'UE (le référentiel est porté par la promotion depuis
  le 16 septembre 2026 ; la promotion précédente peut servir de gabarit à la
  suivante, référentiel compris, à la création).
- Le dossier d'entrée est `back/cmd/syllabus-import/data/` (ignoré par git,
  comme `programme-import/data/`), ou tout dossier passé par `--dossier`.

## 2. Les fichiers du dossier

| Fichier | Rôle |
|---|---|
| `fiches.csv` | Une ligne par matière enseignée du tiers (export). |
| `liaisons_ue_competence.csv` | Les liaisons actives, en trois booléens (export). |
| `referentiel_tiers.csv` | Le référentiel du tiers (export). Lu pour résoudre la **position** d'une compétence dans son bloc (`C5` → 5) ; jamais importé. |
| `correspondance_periodes.csv` (ou `_gabarit.csv`) | **À remplir.** (année, période, préfixe) du tiers → formation, promotion, option, période de l'application, par nom. |
| `correspondance_competences.csv` (ou `_gabarit.csv`) | **À remplir.** Bloc du tiers → promotion et position du bloc dans le référentiel saisi de cette promotion, une ligne par promotion. |
| `exceptions.csv` | Optionnel. Appariements forcés d'UE ou de matières. |

Les correspondances se lisent d'abord sous leur nom sans `_gabarit`, puis
sous le nom du gabarit livré : remplir le gabarit en place suffit.

### Remplir `correspondance_periodes.csv`

Le **préfixe** est ce qui précède le premier `_` du code d'UE
(`INFRES_5_1` → `INFRES`, `2IAiail_iasd_10_1con` → `2IAiail`) : c'est la
règle qui a produit la colonne `formation_prefixe_tiers` du gabarit. Pour
chaque ligne : soit les quatre noms (`formation_name`, `promotion_name`,
`option_name`, `periode_name`), soit aucun — une ligne vide est un
périmètre non importé, une ligne partielle arrête l'outil avant toute
lecture de la base. Les noms sont ceux affichés dans l'application,
comparés espaces réduits et casse ignorée.

### Remplir `correspondance_competences.csv`

Pour chaque bloc du tiers : `promotion_name_scolarite` et
`bloc_ordre_scolarite` (la position du bloc dans le référentiel saisi de
cette promotion, celle qui donne son code affiché), ou rien. **Un bloc du
tiers utilisé par plusieurs promotions occupe une ligne par promotion**
(même `bloc_id_tiers`, promotions différentes) : le référentiel est porté
par la promotion, et la correspondance se cherche par le bloc tiers **et**
la promotion de l'UE de chaque liaison. Un bloc sans aucune ligne remplie
met ses liaisons **hors périmètre** : elles sont comptées, la matrice de
l'UE s'écrit avec les autres. Un bloc mappé pour d'autres promotions
seulement rejette la matrice de l'UE (« bloc d'une autre promotion que
l'UE », avec les promotions mappées) : c'est une ligne qui manque, ou une
liaison du tiers hors de son périmètre — la simulation le dit avant
`--apply`. La base tierce duplique un bloc par formation qui l'utilise :
plusieurs lignes du gabarit peuvent viser le même bloc scolarite.

```csv
bloc_id_tiers,bloc_libelle_tiers,promotion_name_scolarite,bloc_ordre_scolarite,commentaire
19,Concevoir et maintenir le SI,INFRES18,1,
19,Concevoir et maintenir le SI,INFRES19,1,même bloc tiers pour la promotion suivante
1,Analyser et résoudre des problèmes complexes,,,bloc transversal non repris
```

La compétence se résout ensuite par **position** : le `Cn` de son code dans
`referentiel_tiers.csv` doit exister dans le bloc scolarite désigné. Sans
code numérique, ou sans compétence à cette position, la matrice de l'UE
est rejetée (« compétence hors position ») : corriger le référentiel saisi
ou la correspondance, puis relancer.

### Règle d'appariement des UE et des matières

Dans la période désignée par la correspondance :

1. l'UE se cherche par une exception (voir ci-dessous), sinon par son
   **code** tiers (`INFRES_5_1`) contre `unite_enseignement.name`, sinon par
   son **libellé** — le libellé doit être unique dans la période (trois UE
   « Bases Scientifiques ou Technologiques » = « UE ambiguë ») ;
2. la matière se cherche par une exception, sinon par son libellé contre
   `matiere.name` dans l'UE trouvée, unique lui aussi.

Toujours l'égalité après normalisation (espaces réduits, casse ignorée) ;
jamais de rapprochement approximatif. Tout le reste passe par
`exceptions.csv` :

```csv
ue_code_tiers,matiere_libelle_tiers,name_scolarite
INFRES_5_1,,5.1  MATH
INFRES_5_1,Mathématiques pour l'ingénieur,Mathématiques pour l'ingénieur (S5)
```

Une ligne à `matiere_libelle_tiers` vide apparie l'UE ; sinon la matière de
cette UE. Une exception vaut pour toutes les années de l'export.

## 3. Lancer

Depuis la racine du dépôt, la cible `make` source l'environnement local et
lance l'outil ; `SYLLABUS_IMPORT_ARGS` porte les options.

```bash
make importer-syllabus                                   # simulation, dossier par défaut
make importer-syllabus SYLLABUS_IMPORT_ARGS="--dossier /chemin/export"
make importer-syllabus SYLLABUS_IMPORT_ARGS="--apply"    # écrit ce que la simulation annonçait
make importer-syllabus SYLLABUS_IMPORT_ARGS="--apply --force"
```

Options : `--dossier` (défaut `./cmd/syllabus-import/data`), `--exceptions`
(défaut `exceptions.csv` du dossier, s'il existe), `--rapport` (défaut
`rapport-<simulation|import>-<horodatage>.txt` dans le dossier), `--apply`,
`--force`, `--config` (défaut `./cmd/serveur/config.yaml`).

**Sans `--apply`, rien n'est écrit** : la simulation joue toute la passe,
lectures comprises, et produit le même rapport. `--force` ne vaut que pour
le remplacement de ce qui existe déjà ; il n'implique pas `--apply` (un
`--force` seul simule ce qu'un `--apply --force` remplacerait).

## 4. Lire le rapport

Le rapport est un fichier texte, à côté de l'entrée ; l'écran ne montre que
ses totaux et son chemin.

- **Entrée** : lignes lues, correspondances remplies et vides, exceptions.
- **Totaux** : pour les fiches, les descriptions d'UE et les matrices —
  importées (ou à importer, en simulation), inchangées (déjà à l'état
  cible : rien à écrire), rejetées.
- **Rejets par cause**, ligne du fichier d'entrée à l'appui :
  - *période non mappée* — agrégé par clé (année / période / préfixe), avec
    le nombre de lignes de `fiches.csv` : c'est la mesure de ce que les
    correspondances laissent dehors ;
  - *correspondance de période introuvable* — un des quatre noms n'existe
    pas (ou existe deux fois) parmi les entités actives ;
  - *UE inconnue*, *UE ambiguë*, *matière inconnue*, *matière ambiguë* — à
    régler par un renommage dans l'application ou par `exceptions.csv` ;
  - *doublon dans fiches.csv* — deux lignes du tiers pour la même matière
    d'une même UE (les deux sont rejetées : l'export doit trancher) ;
  - *heures hors plage (> 999,99)* — la colonne ne peut pas les porter ;
  - *UE absente de fiches.csv* — une liaison dont l'UE n'a aucune ligne de
    fiche : sa période n'est pas connue, la matrice ne peut pas se résoudre ;
  - *correspondance de bloc introuvable*, *compétence hors position*,
    *bloc d'une autre promotion que l'UE* (mappé pour d'autres promotions,
    pas pour celle de l'UE) — la matrice entière de l'UE est rejetée, rien
    n'est écrit pour elle ;
  - *conflit non forcé* — fiche déjà écrite (version > 0), description déjà
    remplie ou matrice déjà cochée, **et différente** de l'entrée ; `--force`
    remplace. Identique = inchangé, pas un conflit.
- **Signalements**, non bloquants (l'import a eu lieu) :
  - écart entre la ventilation encadrée (cours + cours intégré + TD + TP +
    projet + contrôle + autonomie) et `matiere.heure` — l'écran de la fiche
    le montre aussi ;
  - heures « autre » du tiers, sans colonne dans l'application, non
    importées (valeur rapportée) ;
  - description d'UE non uniforme entre les lignes d'une même UE (la
    première est retenue) ;
  - liaisons du tiers contradictoires sur une même compétence scolarite
    (deux blocs tiers mappés sur le même bloc) : axes fusionnés par union ;
  - UE importée sans aucune liaison de compétence dans le tiers.

Le rapport est identique en simulation et en application, l'en-tête dit
lequel des deux a été joué.

## 5. Démarche conseillée

1. Remplir une correspondance de période, lancer la simulation, lire les
   rejets : ils disent ce qui manque dans la structure ou dans les noms.
2. Compléter `exceptions.csv`, relancer la simulation jusqu'à un rapport
   satisfaisant.
3. `--apply`. Chaque fiche, chaque description et chaque matrice est une
   écriture indépendante : une ligne en échec n'empêche pas les suivantes.
4. Relancer `--apply` : la seconde passe ne rapporte que des inchangés —
   c'est la preuve que l'import est complet. Relancer est toujours sûr.
5. Étendre les correspondances période par période.

Le responsable d'une fiche ou d'une UE déjà saisi à l'écran est conservé
par l'import, `--force` compris.

## 6. Tests

`back/pkg/syllabus/legacy/testdata/` porte une fixture réduite et anonymisée
(deux périodes, une formation à deux promotions, chaque cause de rejet
provoquée une fois),
lue par les tests unitaires (sans base) et d'intégration (nominal,
simulation sans écriture, idempotence, `--force`). Lancement :

```bash
cd back && TEST_DB_URL="host=10.20.2.3 port=5432 user=postgres password=root dbname=scolarite_tu sslmode=disable" \
  go test -p 1 -count=1 ./pkg/syllabus/...
```
