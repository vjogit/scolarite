# Étape 3 — sortie de Toolpad (migration MUI → shadcn/ui)

But de ce lot : retirer `@toolpad/core` — la dépendance non maintenue qui
épinglait MUI v7 — en remplaçant son shell (`DashboardLayout`, `Account`) et
ses notifications (`useNotifications`) par des équivalents shadcn/Base UI et
sonner. **MUI reste en place partout ailleurs** : aucun écran métier
retouché, `composantsTraduits` (Autocomplete) intact, le thème des écrans
reste celui de `layouts/dashboard.tsx`.

Décisions validées par l'utilisateur avant implémentation : sonner comme
socle de notification ; API impérative (suppression du premier argument
`notifications` sur les 19 appelants) ; sidebar en repli-icônes
(`collapsible="icon"`) ; **parité stricte sur le mode sombre** — pas de
bascule visible ajoutée (voir §2, il n'y en avait déjà plus).

## 1. Constaté avant toute écriture

- Les 22 points de contact annoncés se confirment : 19 fichiers
  `useNotifications` (17 appelants + `notify.ts` + le provider de
  `dashboard.tsx`), `ReactRouterAppProvider`/`NavigationItem` dans `App.tsx`,
  `DashboardLayout`/`Account` dans `dashboard.tsx`.
- **La casse e2e prévue n'existe pas.** Les tests visés par la commande
  ciblent `getByRole('link', …)` (droits.spec.ts:43, hierarchieE2E.ts:246,
  salle.spec.ts:17, registre.spec.ts:18) — pas `menuitem` : le sidebar
  Toolpad rendait déjà des liens, celui de shadcn aussi. Les `menuitem` de
  i18n.spec.ts:13,19 viennent du `LanguageSwitcher` (MUI Menu maison), ceux
  de hierarchieE2E.ts:46 et navigation.spec.ts:72 du fil de contexte (MUI
  Menu aussi) — vérifié dans le code : aucun ne vient de Toolpad. Résultat :
  **zéro sélecteur modifié, zéro assertion affaiblie** ; seules les 10
  captures ont bougé (§6).
- `construireNavigation` ne produit aucun `children` en pratique : pas
  d'arbitrage de navigation imbriquée à trancher. La logique de filtrage
  (`possedeUnRole`/`possedeTousLesRoles`, sémantique ET pour la corbeille)
  est déplacée telle quelle, pas réécrite.
- **L'application n'avait plus de bascule clair/sombre visible** : le slot
  `toolbarActions` était remplacé par `CustomActions` (LanguageSwitcher +
  Account), ce qui avait fait disparaître le `ThemeSwitcher` que Toolpad y
  met par défaut. Le mode réel était donc toujours `system` (sauf passage
  par la page témoin). La parité stricte reconduit cet état.
- `useColorScheme()` de `dashboard.tsx` était alimenté par le thème
  CSS-vars que l'`AppProvider` Toolpad montait en racine
  (`createTheme({ cssVariables: …, colorSchemes: { dark: true } })` +
  `CssBaseline enableColorScheme`, clés de stockage `toolpad-mode`), lu dans
  `node_modules/@toolpad/core/esm/AppProvider/*`.

## 2. Correspondance Toolpad → remplaçant, composant par composant

| Toolpad | Remplaçant | Notes |
|---|---|---|
| `ReactRouterAppProvider` (thème racine + contexte session/nav/branding) | `ThemeProvider` MUI racine dans `App.tsx` (`createTheme({ cssVariables: true, colorSchemes: { light: true, dark: true } })`) + `CssBaseline enableColorScheme` | Ne sert qu'à alimenter `useColorScheme` (mode + persistance) et la remise à zéro du corps de page — les deux choses que Toolpad faisait réellement ici. `defaultMode` par défaut = `'system'` (vérifié dans `@mui/system/cssVars/createCssVarsProvider.js:59`), comme avant. Session/navigation n'avaient pas besoin d'un contexte : `SessionContext` existait déjà, la navigation est passée en module (`layouts/navigation.tsx`). |
| `type NavigationItem` | `interface NavigationItemWithRoles` locale (`layouts/navigation.tsx`) | Structure identique (`kind: 'divider'`, `children`, rôles) ; le long commentaire de frontière menu latéral / barre centrale déménage avec elle, intact. |
| `DashboardLayout` | `SidebarProvider` + `Sidebar collapsible="icon"` + `SidebarInset` (composants shadcn générés, `components/ui/sidebar.tsx`) | Repli en colonne d'icônes (tooltip sur chaque entrée), tiroir `Sheet` en mobile, raccourci Ctrl+B et persistance cookie `sidebar_state` hérités du composant shadcn. `h-svh` + `overflow-hidden` + zone de contenu `overflow-auto` reproduisent le cadre Toolpad : la page ne défile pas, le contenu si. |
| `AppTitle` (logo Toolpad + titre) | `<header>` avec `SidebarTrigger` + titre texte | **Le logo Toolpad disparaît** (il n'avait jamais été choisi — c'était le défaut du composant) ; le titre `Gestionnaire Scolarite` reste, constante `TITRE_PRODUIT` non traduite (marque). |
| `Account` + `AUTHENTICATION.signOut` + `localeText` | `MenuCompte` (DropdownMenu Base UI) | Déclencheur = initiale de l'utilisateur (comme l'avatar Toolpad), contenu = nom + courriel + « Déconnexion » (`nav.deconnexion`, clé existante). `signIn` no-op et `accountSignInLabel` disparaissent sans remplaçant : l'entrée en session est faite par Keycloak avant le montage. |
| `NotificationsProvider` + `useNotifications` | `sonner` (`<Toaster position="top-center" closeButton richColors>` dans `dashboard.tsx`) | Voir §3. |

Fichiers shadcn ajoutés par `npx shadcn add sidebar dropdown-menu` :
`sidebar.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `tooltip.tsx`,
`separator.tsx`, `input.tsx`, `skeleton.tsx`, `hooks/use-mobile.ts` —
**zéro dépendance npm nouvelle** pour le shell (`@base-ui/react` et
`lucide-react` étaient déjà installés ; lucide passe de « présent, tree-shaken »
à réellement consommé : 5,6 kB). Adaptations locales aux conventions du
projet, toutes commentées dans les fichiers : chaînes d'interface traduites
(`shell.*` dans `app.json` fr/en — le généré portait « Toggle Sidebar »,
« Sidebar », « Close » en dur), `useSidebar`/`SidebarContext` sortis dans
`sidebar-context.ts` (règle react-refresh, même motif que
`button-variants.ts` au lot 1), `use-mobile.ts` réécrit sur
`useSyncExternalStore` (la version générée posait un état dans un effet,
refusé par `react-x/set-state-in-effect`), et les corrections mécaniques
exigées par `strictTypeChecked` (lint final : 0 erreur, 0 avertissement).

## 3. Notifications — politique préservée, API impérative

`services/notify.ts` garde ses six fonctions, ses trois constantes de durée
et leurs commentaires ; seul le transport change (`toast.success/error/warning`
de sonner) et le premier paramètre `notifications` disparaît — sonner est
impératif, plus rien à transporter. Les 17 appelants sont migrés par un
commit mécanique séparé (suppression de l'import, de l'obtention du hook,
du premier argument et de l'entrée du tableau de dépendances).

- `notifyBlocking` : `duration: Infinity` — le contrat documenté de sonner
  pour « reste jusqu'à fermeture explicite » (gestion de `Infinity` vérifiée
  dans `sonner/dist/index.mjs`, pas seulement dans la doc). Le bouton de
  fermeture est global (`closeButton` sur le `<Toaster>`), comme la croix
  des snackbars Toolpad. **La persistance indéfinie exigée est donc
  disponible — rien à arbitrer.**
- Position `top-center` = l'`anchorOrigin` top/center d'avant.
- `richColors` : sévérités par couleur pleine (vert/jaune/rouge), l'esprit
  des `Alert` MUI ; sans lui les trois sévérités seraient monochromes.
- Compatibilité CSS (invariant #11) : sonner injecte son CSS par une balise
  `<style>` **hors couche**, mais tous ses sélecteurs sont scopés à
  `[data-sonner-toaster]`/`[data-sonner-toast]` (les seules règles `html`
  posent des variables `--toast-*`) et il ne déclare **aucun** `@layer` :
  il ne peut ni écraser un style tiers ni voler la course au premier
  enregistrement des couches. Vérifié dans `sonner/dist/styles.css` et à
  l'écran.
- Différence assumée : sonner empile plusieurs toasts simultanés là où le
  snackbar Toolpad les faisait défiler un par un. Aucun flux de
  l'application n'émet en rafale aujourd'hui.
- Le thème du toaster suit `estSombre` passé en prop — la résolution unique
  de `dashboard.tsx` (invariant #12), pas une re-résolution.

## 4. Mode sombre — continuité de `useColorScheme`

Le remplaçant du rôle « fournisseur de mode » de Toolpad est le
`ThemeProvider` racine d'`App.tsx` (§2). Vérifié à l'écran, pas seulement
déduit : la page témoin `/_cohabitation` bascule bien `mode` par
`setMode()`, la classe `.dark` suit sur `<html>`, tout l'écran (sidebar
shadcn comprise) bascule d'un geste, et le retour clair remet la classe à
vide. L'effet qui pose `.dark` n'a pas bougé de `dashboard.tsx` et reste
avant les `return` anticipés.

**Écart résiduel, signalé** : la clé de persistance du mode passe de
`toolpad-mode` (Toolpad) à `mui-mode` (défaut MUI). Un mode choisi sous
Toolpad est donc oublié — sans conséquence réelle : aucune bascule n'était
accessible hors page témoin, et l'application n'est pas en production.

## 5. Ce que la suite e2e a perdu, gardé — et raté

- **Gardé, sans modification** : les 45 tests passent tels quels — aucune
  assertion affaiblie, aucun sélecteur adapté (§1). La garantie « Corbeille
  absente du menu pour un CONSULTATION » est toujours vérifiée, sur le même
  rôle `link`.
- **Perdu** : rien.
- **Raté, et c'est la leçon du lot** : le premier montage du menu de compte
  plantait toute l'application (Base UI erreur #31 : `Menu.GroupLabel` doit
  vivre dans un `Menu.Group` ; le `DropdownMenuLabel` était posé directement
  sous `DropdownMenuContent`, et l'ErrorBoundary de React Router avalait
  l'écran). **Aucun des 45 tests n'ouvre ce menu** — seule la vérification
  au navigateur (§7) l'a vu. Corrigé (commit dédié), et recensé dans les
  pièges CLAUDE.md : un popup Base UI peut planter *au montage du popup*,
  donc n'être visible ni d'un test qui ne l'ouvre pas, ni d'une capture
  d'écran fermée.

## 6. Journal de réacceptation des captures

Les dix captures ont échoué comme prévu (le shell est sur chaque écran),
les 35 tests fonctionnels restant verts. Chaque image régénérée a été
regardée avant commit. Le changement commun aux dix : sidebar shadcn pleine
hauteur à gauche (fond `--sidebar` = `background.paper` MUI, dérivation §8),
en-tête allégé (déclencheur de repli + titre en texte simple — le logo
Toolpad et le titre bleu disparaissent), avatar = initiale sur fond
`--primary` au lieu du gris Toolpad. Le contenu métier de chaque écran est
identique pixel près à l'ancien cadre près.

| Capture | Spécifique constaté, au-delà du changement commun | Attendu ? |
|---|---|---|
| formation-liste (light/dark) | Arbre, table MRT, boutons inchangés | oui |
| grille-saisie (light/dark) | Notes du seed intactes (Eleve2 : 11 validée, Eleve4 : 7) — le contrôle de rattrapage n'a été écrit par personne | oui |
| certification-toeic (light/dark) | État vide et bouton de création inchangés | oui |
| planning (light/dark) | Semaine du 5–11 janv. 2026 (date fixée), FullCalendar inchangé | oui |
| jury-deliberer-dialog (light/dark) | Dialogue MUI strictement identique ; le voile ne couvre pas visiblement sidebar/en-tête — **comportement déjà présent sous Toolpad**, vérifié sur l'ancienne référence avant de conclure | oui |

Aucun diff surprenant ; aucune capture réacceptée sans lecture.

## 7. Vérification au navigateur (build conteneurs, compte test-e2e)

- Connexion Keycloak → atterrissage sur la reprise de tâche : ✅.
- Shell : repli en icônes ✅ (tooltips), tiroir mobile ✅ (420 px),
  menu de compte ✅ (nom, courriel, Déconnexion — après le correctif §5),
  bascule FR → EN → FR ✅ (liens du sidebar, aria-labels du shell, onglets
  suivent — les nouvelles clés `shell.*` comprises).
- Notifications, une par sévérité, déclenchées par des flux réels :
  succès (délibération d'Eleve1, toast vert), avertissement (annulation de
  cette délibération, toast jaune — l'état du seed est restitué), erreur
  (import d'un faux .xlsx sur les périodes, toast rouge « le fichier est
  illisible ou vide »). Toutes en haut/centre avec bouton de fermeture.
  Découverte en passant : l'échec de vérification d'un témoin s'affiche en
  alerte *inline* (pas un toast) — chemin distinct, non concerné par ce lot.
- Mode sombre : bascule `setMode` de la page témoin (§4) + les cinq
  captures dark (§6). Écrans de chargement/connexion : code inchangé,
  l'effet `.dark` reste avant les `return` anticipés.
- 0 erreur console sur tous les parcours (hors le 400 volontaire de
  l'import invalide).

## 8. Tokens `--sidebar*` — dérivés, plus inertes

Le lot 2 les avait laissés à leur valeur shadcn par défaut (achromatique),
faute de consommateur. Le sidebar les consomme désormais : ils sont passés
en **références** aux tokens déjà dérivés de MUI (`--sidebar: var(--background)`
— le fond `background.paper` du sidebar Toolpad —, `--sidebar-accent:
var(--muted)` pour survol/actif, `--sidebar-border: var(--border)`, etc.,
commentés dans `index.css`). Les références se résolvant à l'usage, le bloc
`.dark` n'a plus à les redéclarer.

## 9. Bundle avant / après

Chunks (`npm run build`, kB minifiés / gzip) :

| Chunk | Avant (lot 2bis) | Après | Δ |
|---|---|---|---|
| `index` (applicatif) | 256.56 / 68.69 | 273.20 / 73.13 | +16.6 — shell + composants shadcn |
| `mui-libs` | 446.96 / 143.90 | 206.33 / 69.43 | **−240.6** — @toolpad/core et sa traîne |
| `mui-material-libs` | 396.89 / 110.11 | 502.14 / 140.96 | +105.3 (redistribution, voir ci-dessous) |
| `vendor` | 555.59 / 171.67 | 818.00 / 255.75 | **+262.4** — Base UI, floating-ui, sonner |
| `assets/index-*.css` | 25.84 / 5.58 | 58.17 / 10.38 | +32.3 — styles sidebar/menu/sheet + utilitaires |
| autres (tanstack, fullcalendar, recharts, runtime) | — | — | inchangés |

La redistribution entre chunks brouille la lecture ; le diff **par paquet**
(rollup-plugin-visualizer, tailles rendues, comparé contre un build du
commit d'avant-lot dans un worktree) est la mesure fiable :

| Paquet | Avant | Après | Δ kB |
|---|---|---|---|
| `@base-ui/react` | 25.3 | 335.4 | **+310.2** (menu, dialog/sheet, tooltip et leurs internes) |
| `sonner` | 0 | 52.8 | +52.8 |
| `@floating-ui/*` | 0.5 | 52.5 | +52.0 (positionnement, tiré par Base UI) |
| code applicatif | 539.6 | 563.8 | +24.2 |
| `lucide-react` | 0 | 5.6 | +5.6 |
| `@toolpad/core` | 67.5 | 0 | **−67.5** |
| `path-to-regexp` | 8.8 | 0 | −8.8 |
| `@mui/material` | 623.3 | 605.2 | −18.0 (composants que seul Toolpad montait) |

**Le bundle grossit d'environ +45 kB gzip au total.** Comme annoncé par la
commande, le gain de ce lot est en dette (dépendance non maintenue retirée,
épingle MUI v7 levée), pas en poids — et les primitives Base UI coûtent
même nettement plus lourd que le Toolpad qu'elles remplacent. Constat, pas
défaut : Base UI est la bibliothèque de primitives actée à l'init (lot 1),
ce coût est celui de tout le reste de la migration, payé une fois.
`@mui/x-data-grid` : confirmé disparu du lockfile avec `@toolpad/core`
(il n'était déjà pas bundlé).

## 10. Lockfile

`+1 / −29 / 0` : `sonner` ^2.0.8 seul ajout ; 29 paquets retirés, tous dans
la traîne de `@toolpad/core` (`@mui/x-data-grid`, `@mui/x-virtualizer`,
`@toolpad/utils`, `execa`, `prettier`, `yaml`, …) ; **aucun paquet existant
n'a changé de version**. Vérifié par diff structuré des deux lockfiles —
rien qui ne découle pas directement du retrait de Toolpad et de l'ajout du
toaster.

## 11. Vérifications finales

| Vérification | Résultat |
|---|---|
| `grep -rn "@toolpad" src/ e2e/ package.json` | ✅ zéro occurrence |
| `npm run lint` | ✅ 0 erreur, 0 avertissement |
| `npm run build` (`tsc -b` + vite) | ✅ |
| `make test-ihm` (run 1) | ✅ 45 passed |
| `npx playwright test` (run 2, autre point d'entrée) | ✅ 45 passed |

La fragilité `BarreAxes` n'a pas ressurgi pendant ces cycles — le protocole
`git stash`/contrôle n'a pas été nécessaire.

## 12. Ce qui n'a pas été traité

- Les deux bugs i18n du lot 2bis (`actionMobiliteLibelle`,
  `actionProgrammeLibelle`) : intacts, hors périmètre.
- L'inversion de la source du mode sombre (Tailwind décide, MUI suit) :
  Toolpad sorti, elle est désormais *possible* — mais c'est un lot à part
  entière, CLAUDE.md mis à jour en ce sens.
- La montée MUI v9 (déverrouillée par ce lot) : non entamée.
- L'erreur de vérification de témoin en alerte inline plutôt qu'en toast
  (§7) : comportement pré-existant, signalé sans correction.
- La page témoin `/_cohabitation` : toujours en place, retrait prévu en fin
  de migration (lot 1 §5).
- Un test e2e ouvrant le menu de compte (la classe de défaut du §5 n'est
  couverte par aucun test) : à ajouter dans un lot e2e futur, non fait ici
  pour ne pas mélanger les périmètres.
