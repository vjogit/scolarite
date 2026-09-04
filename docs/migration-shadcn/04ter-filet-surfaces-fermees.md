# Étape 4ter — élargir le filet aux surfaces fermées par défaut

But de ce lot : couvrir ce que les lots 5 à 17 vont remplacer et que rien ne
surveillait — popups et dialogues OUVERTS (captures), comportement du cadre de
formulaire, navigation au clavier. Motif : les quatre défauts graves des lots
3 à 4bis vivaient tous derrière une surface fermée par défaut, tous vus à
l'écran, aucun par la suite. Périmètre : `front/e2e/` uniquement (plus un
ajout au seed, validé — voir §2). Ce lot ajoute des tests, ne corrige rien.

## 1. Constaté avant toute écriture (vs déduit)

- **Constaté, et c'est la découverte structurante du lot** : le dialogue de
  suppression AVEC saisie de confirmation était **inatteignable** avec le seed
  d'alors. Seules formation et promotion portent
  `deleteRequiresNameConfirmation`, or « E2E Formation » et « E2E Promotion »
  contiennent toutes deux la période délibérée du seed : leur suppression est
  BLOQUÉE (« 1 période a un jury délibéré »), et l'état bloqué masque la
  branche saisie (`!estBloque && confirmationRequise`,
  `DeleteConfirmDialog.tsx`). Vu à l'exécution du premier jet, pas déduit.
- **Constaté** (pendant le test négatif, §5) : le retrait du `type="button"`
  explicite d'« Annuler » (`Form.tsx`) n'est **plus** le bug du lot 4 — la
  primitive Base UI le défend elle-même (`useButton` pose `type: 'button'` par
  défaut sur un bouton natif). Suite complète verte avec l'attribut retiré,
  vérifié. L'attribut explicite est une ceinture, la bretelle est dans la
  primitive ; la régression *plausible* pour les lots 5-17 est le retour à un
  `<button>` natif nu — c'est elle qui a servi au test négatif.
- **Constaté** : Base UI focalise la **première entrée du menu dès l'ouverture
  au clavier** (Entrée sur le déclencheur), pas après une première flèche ;
  Échap rend le focus au déclencheur. Mesuré au navigateur avant d'écrire les
  assertions (le premier jet supposait l'inverse et a échoué).
- **Constaté** : `make -f makefile.local test-ihm` échoue depuis la racine
  (variables `SECRETS_FILE_LOCAL`/`CONFIG_FILE_LOCAL` définies par le
  makefile racine) — le point d'entrée est `make test-ihm`. La mention dans
  CLAUDE.md a été corrigée.

## 2. L'ajout au seed — « E2E Promo Vide », validé avant écriture

Conséquence directe du premier constat : sans nouvelle donnée, la surface
« saisie de confirmation » restait infilmable. Trois options soumises
(ajout au seed / capturer l'état bloqué à la place / laisser de côté) ;
**l'utilisateur a validé l'ajout**. Une promotion sans descendance sous
« E2E Formation » : non bloquée, cascade vide (« Aucune donnée liée »), saisie
exigée dès l'ouverture. Aucun test ne la supprime ; la purge du seed
l'emporte par CASCADE — idempotence par pose inchangée (deux exécutions
consécutives vérifiées, §6).

**Le nom est un choix, pas un hasard.** Le premier essai, « E2E Promotion
Vide », a cassé trois tests à l'exécution : les localisateurs Playwright par
nom accessible matchent par SOUS-CHAÎNE, et « Promotion E2E Promotion »
(arbre), « Actions — E2E Promotion » (menus de i18n.spec.ts) devenaient
ambigus — violation du mode strict. « E2E Promo Vide » ne contient aucun nom
existant comme préfixe : zéro sélecteur existant touché, zéro `exact: true`
ajouté aux specs existantes. Règle ajoutée aux pièges CLAUDE.md : tout
nouveau nom du seed ne doit faire d'aucun nom existant un préfixe.

Effet sur l'existant, vérifié et non supposé : les 12 captures existantes
n'ont pas bougé (l'arbre est replié dans `formation-liste`, la promotion
n'apparaît dans aucune autre image) ; les 48 tests existants sont restés
verts sans modification d'une seule ligne.

## 3. a) Captures d'états ouverts — `captures-ouvertes.spec.ts`

Quatre surfaces × deux modes, 8 PNG, 532 Ko
(`e2e/captures-ouvertes.spec.ts-snapshots/`). Chaque image regardée avant
commit.

| Capture | Surface | Vérifié avant capture | **Non couvert** |
|---|---|---|---|
| `menu-actions-*` | `MenuActionsLigne` déployé (nœud formation, Structure) : navigation + séparateur + bloc destructif | menu visible, « Supprimer » visible, aucune infobulle | Les menus MRT internes (colonnes, densité…) ; le menu d'une ligne de *liste* (même composant, ancrage différent) |
| `dialogue-suppression-simple-*` | `DeleteConfirmDialog` sans saisie (option E2E) : cascade chiffrée, corbeille annoncée | analyse d'impact RÉSOLUE, saisie absente affirmée | L'état bloqué (couvert textuellement par corbeille.spec.ts) ; l'échec d'analyse (`impactEchec`) |
| `dialogue-suppression-confirmation-*` | `DeleteConfirmDialog` avec saisie (« E2E Promo Vide ») : « Aucune donnée liée », champ Confirmation focalisé, Supprimer désactivé | idem + saisie visible | La cascade > `SEUIL_CONFIRMATION` réelle (même écran, autre déclencheur — non constructible sans seed massif) |
| `menu-compte-*` | Le menu de compte du shell — celui qui plantait au lot 3 | menu + « Déconnexion » visibles | Le clic de déconnexion lui-même (détruirait la session partagée) |

Ce que ces captures NE garantissent PAS, globalement : aucun comportement —
elles photographient. Le dialogue de purge de la corbeille (composant à part)
et `UnsavedChangesDialog`/`LignesRefuseesDialog` (encore MUI, lot suivant)
n'ont pas de capture ; la garde de sortie est couverte fonctionnellement
(§4), pas visuellement.

### Pièges de déterminisme rencontrés — tous traités, dans le fichier

- **La souris reste sur le déclencheur après le clic d'ouverture** : état de
  survol sur l'entrée de menu sous-jacente et infobulle du bouton ⋮ dans le
  cadre. `mouse.move(0, 0)` avant chaque capture + absence d'infobulle
  affirmée (`toHaveCount(0)`) — la version popup du piège du lot 4bis.
- **L'analyse d'impact est une requête** : capturer avant sa résolution
  photographie un spinner à l'avancement non reproductible. L'alerte de
  cascade est attendue et « Analyse de l'impact en cours… » affirmé absent.
- **Les nombres de cascade dépendent de l'état de la base** : le fichier
  s'exécute avant les specs qui mutent (`corbeille`, `grille-saisie` —
  ordre alphabétique, `workers: 1`) et est lui-même strictement sans
  écriture. Documenté en tête du fichier, avec l'avertissement de ne pas le
  renommer sans revérifier.
- **Deux suites simultanées se détruisent mutuellement** : constaté une fois
  (un lancement de fond oublié + un lancement direct) — re-seed de l'une en
  plein run de l'autre, échecs de contamination sur corbeille et grille.
  Aucun correctif à faire : ne jamais lancer deux suites en parallèle.

## 4. b) Comportement de formulaire — `formulaire.spec.ts`

Terrain : création de formation (Structure), seul refus serveur provocable de
façon fiable — le doublon d'un nom actif viole `uk_formation_name_active`,
traduit en `VALIDATION_ERROR` sur `name`, un cas que zod ne peut pas voir.
Aucun test ne crée d'entité (toute soumission tentée est un doublon refusé).

| Test | Garantit | **Ne garantit pas** |
|---|---|---|
| Annuler sans modification | sortie directe, pas de garde (absence affirmée) | — |
| Garde sur saisie non enregistrée | la garde s'interpose, « Rester » préserve la saisie, « Quitter » sort **sans créer** (absence de la ligne affirmée) | la garde `beforeunload` (fermeture d'onglet) ; les autres formulaires (même cadre, autres champs) |
| Refus serveur sur champ | motif traduit affiché, `aria-invalid`, **focus revenu au champ fautif** (`premierChampEnErreur`) | les champs sous `Controller` (DatePicker…) — le repère `aria-invalid` n'est exercé ici que sur un `register` |

Nuance importante, apprise du test négatif : sur la régression « bouton
natif », seul le test « ne crée rien » échoue — les deux autres passent par
accident de course (la navigation d'annulation gagne contre la soumission).
C'est le bon test qui attrape : le dégât réel du bug était la création.

## 5. c) Navigation au clavier — `clavier.spec.ts`

Quatre tests : menu d'actions (ouverture Entrée, première entrée focalisée,
flèches jusqu'au bloc destructif, Échap ferme et rend le focus au
déclencheur) ; dialogue avec saisie (focus dans la saisie, Échap) ; dialogue
simple (focus sur « Annuler », Tab boucle Annuler ↔ Supprimer dans le piège à
focus, Échap rend le focus au déclencheur) ; formulaire (focus au premier
champ, `premierChampSaisissable`).

**Ne garantit pas** : l'ordre de tabulation complet d'un formulaire riche ;
le focus après fermeture *par choix d'une entrée* (navigation) ; les
raccourcis Home/End des menus ; le comportement lecteur d'écran (rôles/noms
seulement).

## 6. Le test négatif — deux régressions réelles du lot 4, rejouées

Protocole du lot 2bis : modification temporaire de `front/src`,
reconstruction du conteneur (~1 min), suite complète, restauration, diff
vérifié vide. La base a été nettoyée de la formation que la régression A a
réellement créée (une ligne, supprimée par psql, vérifié par la suite finale
verte — les captures de liste auraient vu un reliquat).

| Régression | Nouveaux tests | Anciens tests (48) | Verdict |
|---|---|---|---|
| **A — « Annuler » redevient un `<button>` natif** (le mécanisme exact du bug lot 4 ; le simple retrait de `type="button"` n'est plus une régression, cf. §1) | **3 échecs** : « Annuler ne crée rien » (l'entité EST créée), + les 2 captures `menu-actions` (le formulaire de consultation, visible derrière le menu, montre le bouton dé-stylé) | **48 verts** | Le lot était nécessaire : comportement ET apparence attrapés, silence complet de l'existant |
| **B — retrait du `w-max` du menu d'actions** (l'autre bug lot 4) | **2 échecs** : les 2 captures `menu-actions` (largeur calée sur ⋮, libellés sur deux lignes — l'image du diff reproduit le bug d'époque à l'identique) | **48 verts** — y compris i18n.spec.ts qui OUVRE ce menu : rôle et texte restent accessibles dans un menu cassé | La démonstration du motif du lot : « largeur, ni rôle ni texte » |
| A-bis — retrait du seul attribut `type="button"` | 0 échec — **et c'est le bon verdict** : Base UI pose le type par défaut, il n'y a pas de régression à attraper | 48 verts | Rapporté comme découverte, pas contourné (§1) |

Résurgence pendant les cycles : `notes-unifie.spec.ts:6` a échoué une fois
pendant le run B (6,7 min, réessais `cliquerPuisAttendreUrl`). Relance sur
code restauré : vert — le défaut de rendu figé `BarreAxes`, pré-existant et
documenté, pas ce lot. Méthode prévue par la commande, appliquée.

## 7. Coût

- **Durée de la suite** : 48 tests en 3 min 15 avant → 63 tests en
  3 min 49 (`make test-ihm`) / 3 min 53 (`npx playwright test`) après —
  **+35 à 40 s**, dont l'essentiel pour les 8 captures (2 à 4 s chacune).
  Pas de décision à prendre à ce niveau de coût.
- **Poids** : 532 Ko pour les 8 PNG (37 à 94 Ko), soit ~1,1 Mo de captures
  versionnées au total avec les 12 existantes.
- Reconstruction du conteneur pour le test négatif : ~1 min par cycle.

## 8. Vérifications finales

| Vérification | Résultat |
|---|---|
| `make test-ihm` (run 1) | ✅ 63 passed (3 min 49) |
| `npx playwright test` (run 2, autre point d'entrée, sans régénération) | ✅ 63 passed (3 min 53) |
| Captures existantes (12) | ✅ aucune n'a bougé |
| Tests existants (48) | ✅ aucun modifié, tous verts |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `git diff front/src` après test négatif | ✅ vide |
| Seed : deux poses consécutives | ✅ état final identique (chaque run le repose) |
| `retries` | ✅ toujours 0 ; aucun `waitForTimeout` |

## 9. Ce qui n'a pas été traité

- L'état **bloqué** du dialogue de suppression n'a pas de capture (assertion
  textuelle dans corbeille.spec.ts uniquement) — écarté pour tenir les
  « quatre surfaces, pas au-delà ».
- Le dialogue de **purge** de la corbeille (composant distinct, avec saisie) :
  ni capture ni test clavier — il mute l'état pour être atteint.
- `UnsavedChangesDialog` (encore MUI) : couvert fonctionnellement (§4), pas
  de capture ; candidat naturel quand son lot le migrera.
- Les trois tests de formulaire n'exercent qu'un formulaire à un champ ; les
  champs `Controller` (dates, autocomplete) n'exercent pas le repère
  `aria-invalid` de `focus.ts`.
- Le menu de compte n'est capturé qu'ouvert — la déconnexion réelle n'est
  pas cliquée (session partagée par la suite).
- Défauts pré-existants intacts : rendu figé `BarreAxes` (reconfirmé §6),
  rebond Keycloak sur lien profond froid (`test.fail` en place).
