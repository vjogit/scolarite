# Étape 2bis — élargir le filet de régression

But de ce lot : couvrir les quatre workflows jamais visités par la suite
(certification, salle, registre, planning) par des tests de fumée, et poser
un filet visuel (captures de référence) qu'aucun test de rôle/texte
accessible ne remplace — puis PROUVER que ce filet détecte effectivement ce
que les tests fonctionnels ne détectent pas. Périmètre : `front/e2e/`
uniquement. Ce lot ajoute des tests, ne corrige rien.

## Constaté avant toute écriture

- Les 31 tests existants (lot 1bis) ne visitent jamais `certification`,
  `salle`, `registre` ; `programme`/`planning` n'apparaît que comme un clic
  d'onglet (`navigation.spec.ts:49`), sans jamais atteindre l'écran lui-même.
- `seed.sql` ne pose **aucune** donnée pour ces quatre écrans : ni résultat
  TOEIC/Mobilité, ni salle, ni réservation de planning. Vérifié en relisant
  le script avant d'écrire la moindre assertion (grep sur `toeic`, `salle`,
  `reservation` : aucune occurrence). Le registre, lui, n'a pas de dépendance
  au seed : ses deux premières cartes lisent l'état réel de la chaîne
  (recalcul serveur complet) et de l'ancrage, quel que soit ce que la base
  contient.
- Conséquence directe : les quatre écrans de fumée ci-dessous vérifient un
  **état vide explicite**, pas une ligne de données — conforme à la consigne
  (« vérifie ce que seed.sql pose réellement avant d'écrire l'assertion »).
  Aucune question à poser, aucun ajout à `seed.sql` : les quatre écrans sont
  testables tels quels.

## a. Tests de fumée — ce qu'ils couvrent, et surtout ce qu'ils NE couvrent PAS

Quatre fichiers, un test chacun, objectif assumé restreint : la page se
charge, son en-tête est visible, son contenu principal (une ligne ou l'état
vide explicite) est présent, aucune erreur console de niveau `error`.

| Fichier | Écran atteint | Vérifié | **Non couvert** |
|---|---|---|---|
| `certification.spec.ts` | TOEIC (état vide) | En-tête, message vide, 0 erreur console | **Mobilité internationale** — voir §5, sa navigation traverse un libellé de menu cassé ; aucune écriture (créer un résultat TOEIC/Mobilité) ; aucune validation métier (score, dates) |
| `salle.spec.ts` | Liste des salles (état vide) | En-tête, message vide, 0 erreur console | Création d'une salle, ses types, le filtrage |
| `registre.spec.ts` | Les trois cartes (Intégrité, Ancrage, Témoin) | Les trois en-têtes visibles, deux alertes résolues (pas de chargement infini), 0 erreur console | Le verdict exact (chaîne valide vs rompue — dépend de l'état réel, non testé) ; le déclenchement d'un ancrage (`make ancrer`) ; la vérification effective d'un témoin |
| `planning.spec.ts` | Planning (calendrier vide) | Barre d'outils FullCalendar, panneau des heures, 0 erreur console | Toute réservation (aucune seedée) ; le dialogue de réservation (`ReservationDialog`) ; le glisser-déposer ; la détection de conflit |

Ces quatre écrans restaient jusqu'ici **entièrement** hors du filet : un
écran blanc ou un plantage au montage y serait passé inaperçu. Ce n'est plus
le cas — mais le lot ne valide toujours pas le métier de ces écrans, comme
annoncé.

### Deux aides ajoutées à `hierarchieE2E.ts`, une découverte en les écrivant

`allerJusquaPromotionCertification`/`allerAuTOEIC` et `allerAuPlanning`
réutilisent `choisirNiveau`/`allerJusquaPeriode` existants. En les écrivant,
deux comportements de navigation non documentés se sont révélés (vérifiés à
l'exécution, pas déduits) :

- Sélectionner la **promotion** dans le fil de contexte du workflow
  Certifications ne laisse pas sur la liste des promotions : elle navigue
  directement vers le premier écran terminal (TOEIC), sautant la liste et
  son menu d'actions. `allerJusquaPromotionCertification` s'arrête donc à la
  formation ; `allerAuTOEIC` clique ensuite le menu d'actions de la ligne
  promotion, exactement comme un utilisateur le ferait.
- À l'inverse, sélectionner la **période** dans le fil de contexte du
  workflow Programme navigue *directement* vers Planning — son unique écran
  terminal. `allerAuPlanning` est donc un simple appel à
  `allerJusquaPeriode(page, 'programme')`, sans clic d'action de ligne.

Cette différence (Certifications expose deux écrans terminaux à choisir,
Programme un seul) explique pourquoi les deux aides ont une forme
différente — documenté dans leurs commentaires respectifs, pas juste dans ce
rapport.

## b. Captures de référence

Dix captures (cinq écrans × deux modes), dans `e2e/captures.spec.ts` :

1. Liste Formation (écran MRT représentatif, Structure)
2. Grille de saisie des notes
3. Écran de certification (TOEIC, état vide)
4. Planning (date fixée)
5. Dialogue de formulaire ouvert — délibération d'un élève (Jury), le seul
   `role="dialog"` du périmètre couvert ; « formulaire » au sens large : un
   `Switch` et un texte, pas un `TextField`, pour varier des captures 1-4

### Déterminisme — chaque risque identifié et traité

- **Colonnes `id`/`version` des listes MRT** : masquées par défaut
  (`COLONNES_TECHNIQUES` dans `usePersistentTableState.ts`), `sessionStorage`
  neuf à chaque test (nouveau contexte de navigateur par test) — vérifié
  dans le DOM avant d'écrire les captures, pas supposé. Rien à masquer : ces
  colonnes ne s'affichent jamais sans une action explicite qu'aucun test ne
  fait.
- **Grille de saisie — le contrôle ciblé** : `E2E.controleRattrapage`, pas le
  défaut (`E2E.controleContinu`). `grille-saisie.spec.ts` écrit sur le
  contrôle continu ; si la capture avait ciblé le même contrôle, son résultat
  aurait dépendu de l'ordre d'exécution des fichiers de spec (résolu au lot
  1bis pour le *seed*, pas pour les mutations que les tests eux-mêmes
  produisent). Vérifié : aucun test, existant ou nouveau, n'écrit sur le
  contrôle de rattrapage — ses notes restent exactement celles de `seed.sql`
  (Eleve2 validé, Eleve4 non validé).
- **Planning — la date d'ouverture** : `Planning.tsx` lit
  `sessionStorage.getItem('planning_date')` une seule fois, à l'ouverture
  (initialiseur paresseux de `useState`). Sans le fixer, l'en-tête du
  calendrier (« 24 – 30 août 2026 ») aurait changé de semaine à chaque
  exécution. Posé via `page.addInitScript` avant toute navigation
  (`2026-01-05`, dans la période E2E) — capturé : « 5 – 11 janv. 2026 »,
  stable.
- **Mode clair/sombre** : `page.emulateMedia({ colorScheme })`, pas de clic
  sur un contrôle ni de token posé à la main — la même source unique que le
  reste de l'application (`layouts/dashboard.tsx`, invariant CLAUDE.md #12).
- **Animations** : `animations: 'disabled'` sur chaque `toHaveScreenshot()` —
  gèle transitions CSS et curseur clignotant.
- **Viewport** : celui du projet Chromium (`playwright.config.ts`,
  `devices['Desktop Chrome']`), non modifié — déjà fixe.

### Coût en Ko et en temps

572 Ko pour les dix PNG (`e2e/captures.spec.ts-snapshots/`, de 37 Ko à
74 Ko chacun — la grille de saisie et le dialogue, les écrans les plus
denses, sont aussi les plus lourds).

Durée de la suite complète (`make test-ihm`) : ~2,1–2,3 min avant ce lot (31
tests, lot 1bis) → ~3,1–3,2 min après (45 tests) — environ **+50 à 60
secondes**, pour l'essentiel les dix captures (2 à 10 s chacune) et les
quatre tests de fumée (2 à 4 s chacun). Mesuré sur les journaux des
exécutions de vérification (§d), pas estimé.

## c. Procédure de réacceptation — une décision, pas une formalité

Documentée dans `.claude/CLAUDE.md` (section « Suite e2e ») pour qu'un agent
futur la trouve écrite plutôt que de la contourner par facilité :

```
npx playwright test captures.spec.ts --update-snapshots
```

**Regarder chaque image avant de committer.** La commande ne demande aucune
confirmation ; elle écrase les dix références sans jugement sur ce qui a
changé. Un lot qui déplace un bouton d'un pixel et un lot qui fait
disparaître tout le style MUI produisent tous deux une commande qui se
termine sans erreur — seule une paire de captures avant/après, regardée,
distingue les deux.

## d. Test négatif — la démonstration

Neutralisation temporaire du `<GlobalStyles>` de `main.tsx` (invariant
CLAUDE.md #11 — retrait de l'élément et de son import, seule exception
autorisée à « ne pas toucher `front/src` » dans ce lot, annulée avant tout
commit). Reconstruction du conteneur, suite complète relancée.

| Vérification | Résultat |
|---|---|
| Diff final (`git diff --stat -- front/src/`) après restauration | **vide** — confirmé, pas supposé |
| Les 10 captures, GlobalStyles neutralisé | **10 échouent** (5 écrans × 2 modes, aucune exception) |
| Les 4 tests de fumée de ce lot + les 28 tests fonctionnels existants | **35 verts** — aucun n'a détecté la régression |

Détail d'un échec (`liste Formation`, clair) :

```
Error: expect(page).toHaveScreenshot(expected) failed
  16169 pixels (ratio 0.02 of all image pixels) are different.
```

Les neuf autres échouent avec le même type d'écart (quelques centièmes du
total de pixels — la régression touche des marges et des fonds, pas toute
l'image). Restauration du `<GlobalStyles>`, reconstruction, suite relancée :
les dix captures repassent au vert.

**Conclusion sans ambiguïté** : les captures détectent à 100 % une
régression que 35 tests de rôles/textes ne voient pas — exactement la classe
de défaut que l'étape 1 avait laissé passer (toute l'application avait perdu
son apparence MUI, 31 tests verts). Le filet remplit sa seule raison
d'être ; pas de révision de son périmètre à faire.

## e. Fragilité observée en marge du test négatif — pré-existante, pas nouvelle

Pendant les cycles de reconstruction du test négatif, le défaut de rendu
figé de `BarreAxes` (déjà documenté dans `cliquerPuisAttendreUrl`,
`hierarchieE2E.ts`) a fait échouer, à plusieurs reprises et sur des
exécutions distinctes : `notes-unifie.spec.ts:81` (existant, non touché),
`grille-saisie.spec.ts:51` (existant, non touché), et la capture « grille de
saisie » de ce lot (les deux modes, `allerALaGrilleDeSaisie` traverse le
même sélecteur d'axe UE → Matière).

**Vérifié, pas supposé** : `git stash` de tout ce lot, `npx playwright test`
sur le code strictement inchangé — `notes-unifie.spec.ts:81` échoue à
l'identique, même point d'arrêt
(`getByRole('row', { name: 'E2E Matiere' })`). La fragilité est confirmée
pré-existante et indépendante de ce lot, pas causée par lui.

**Distinction importante, à ne pas confondre** (précisée dans l'ajout à
CLAUDE.md, §c) : cette fragilité fait échouer la **navigation** vers l'écran
— un timeout avant toute capture — jamais la comparaison d'image
elle-même. Sur toutes les exécutions où la navigation a abouti, la capture
de la grille de saisie a produit un résultat identique aux références,
run après run. La grille de saisie reste, de ce fait, la moins fiable des
cinq captures — pas parce qu'elle est indéterministe, mais parce qu'elle
est seule (avec le dialogue de délibération, dans une moindre mesure — il
passe par `allerJusquaPeriode` mais pas par `cliquerAxe`) à emprunter le
chemin de navigation le plus exposé au défaut BarreAxes. Signalé, pas
corrigé (`front/src` hors périmètre, `BarreAxes` déjà documenté comme
défaut connu).

## f. Deux défauts d'i18n découverts, non corrigés

Constatés en explorant la navigation vers TOEIC et Planning, avec preuve
(capture d'écran/arborescence d'accessibilité) :

- **`actionMobiliteLibelle`** — le menu d'actions de la ligne promotion,
  workflow Certifications, affiche cette clé brute au lieu de « Mobilité
  internationale ». `actionMobilite()` (`certification/routes.tsx`) est
  appelée sans le `t` du composant, retombant sur `i18n.t` global sans
  espace de noms explicite.
- **`actionProgrammeLibelle`** — même motif, sur la seule action de ligne du
  niveau période du workflow Programme (`programme/routes.tsx`,
  `actionProgramme()`).

Même cause probable dans les deux cas (fonction `action*()` appelée sans
argument, secours sur `i18n.t` sans namespace) — un candidat plausible à un
correctif unique, mais non tranché ici : `front/src` est hors périmètre de
ce lot. `allerAuPlanning` (§a) documente pourquoi ce second défaut n'a
finalement pas eu besoin d'être traversé (sélectionner la période saute
directement à Planning) ; `allerAuTOEIC`, lui, évite délibérément le lien
Mobilité internationale (TOEIC seul est testé).

Une troisième anomalie mineure, notée sans investigation approfondie :
l'aria-label du menu de sélection d'option affiche « Changer de option » au
lieu de « Changer d'option » (élision manquante devant une voyelle) —
cosmétique, sans impact fonctionnel constaté.

## g. Ce qui n'a pas été traité

- Le métier des quatre nouveaux écrans (§a) : écriture, validation,
  interactions riches (drag & drop du planning, dépôt de témoin) — hors de
  l'objectif « fumée » assumé par ce lot.
- Les deux défauts d'i18n (§f) : signalés avec preuve, non corrigés.
- Le défaut de rendu figé `BarreAxes` (§e) : pré-existant, déjà documenté,
  non corrigé — nouvelle confirmation de sa réalité, pas une découverte.
- La grille de saisie comme capture la moins fiable des cinq (§e) : signalé,
  aucune parade ajoutée (une nouvelle aide de navigation contournant
  `BarreAxes` serait un correctif du défaut lui-même, pas de ce lot).
- Aucun test existant modifié ; `retries` toujours à `0` ; aucun
  `waitForTimeout` ajouté ; `seed.sql` non touché.
