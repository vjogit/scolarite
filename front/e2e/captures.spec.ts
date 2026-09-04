import { test, expect } from './fixtures/roles';
import {
    E2E, allerALaGrilleDeSaisie, allerAuPlanning, allerAuTOEIC, allerJusquaPeriode, attendreChargementInitial,
} from './aide/hierarchieE2E';
import { app, note } from './aide/i18n';

/**
 * Captures de référence — le filet visuel qu'aucun rôle ni texte accessible
 * ne remplace. L'étape 1 l'a montré de la pire façon : toute l'application
 * avait perdu son apparence MUI (boutons et champs sans fond ni marge) et
 * les 31 tests de rôles/textes restaient verts. Voir
 * docs/migration-shadcn/02bis-filet-regression.md pour la démonstration
 * (neutralisation volontaire de l'invariant CLAUDE.md #11, captures en échec,
 * tests fonctionnels toujours verts).
 *
 * RÉACCEPTER UN DIFF DE CAPTURE EST UNE DÉCISION, PAS UNE FORMALITÉ —
 * regarder l'image avant `--update-snapshots`. Voir la section « Suite e2e »
 * de CLAUDE.md et le rapport du lot pour la procédure complète.
 *
 * Déterminisme :
 *  - `page.emulateMedia({ colorScheme })` pilote clair/sombre — source
 *    unique déjà en place côté MUI (`layouts/dashboard.tsx`, invariant
 *    CLAUDE.md #12) : aucun token ni mode posé à la main ici.
 *  - Les colonnes id/version des listes MRT restent masquées par défaut
 *    (`sessionStorage` neuf à chaque test, cf. `usePersistentTableState.ts`,
 *    `COLONNES_TECHNIQUES`) : rien à masquer, leur valeur croît à chaque
 *    seed et ne serait jamais reproductible d'une exécution à l'autre.
 *  - La grille de saisie cible le contrôle de RATTRAPAGE
 *    (`E2E.controleRattrapage`), qu'aucun autre test n'écrit — le contrôle
 *    continu par défaut, lui, est mutable par `grille-saisie.spec.ts`, et sa
 *    capture dépendrait de l'ordre d'exécution des fichiers.
 *  - Le planning fixe sa date d'ouverture (`sessionStorage.planning_date`,
 *    lu par `Planning.tsx`) : sans elle, l'en-tête du calendrier changerait
 *    de semaine à chaque exécution.
 *  - `animations: 'disabled'` sur chaque capture : gèle transitions CSS et
 *    curseur clignotant.
 */

const MODES = ['light', 'dark'] as const;

for (const colorScheme of MODES) {
    test.describe(`Captures (${colorScheme})`, () => {
        test.beforeEach(async ({ pageAdmin }) => {
            await pageAdmin.emulateMedia({ colorScheme });
        });

        test('liste Formation (écran MRT représentatif)', async ({ pageAdmin }) => {
            await pageAdmin.goto('/');
            await attendreChargementInitial(pageAdmin);
            await pageAdmin.getByRole('tab', { name: app.workflows.structure }).click();
            await pageAdmin.waitForLoadState('networkidle');
            await expect(pageAdmin.getByRole('heading', { name: 'Formations' })).toBeVisible();

            await expect(pageAdmin).toHaveScreenshot(`formation-liste-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });

        test('grille de saisie des notes', async ({ pageAdmin }) => {
            await allerALaGrilleDeSaisie(pageAdmin, undefined, E2E.controleRattrapage);
            await expect(pageAdmin.getByRole('table', { name: 'Grille de saisie des notes' })).toBeVisible();

            await expect(pageAdmin).toHaveScreenshot(`grille-saisie-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });

        test('écran de certification (TOEIC, état vide)', async ({ pageAdmin }) => {
            await allerAuTOEIC(pageAdmin);
            await expect(pageAdmin.getByRole('heading', { name: 'TOEIC' })).toBeVisible();

            await expect(pageAdmin).toHaveScreenshot(`certification-toeic-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });

        test('planning (date fixée)', async ({ pageAdmin }) => {
            // Posé avant toute navigation de cette page : `Planning.tsx` lit
            // cette clé une seule fois, à l'ouverture (initialiseur paresseux
            // de `useState`).
            await pageAdmin.addInitScript(() => {
                sessionStorage.setItem('planning_date', '2026-01-05');
            });
            await allerAuPlanning(pageAdmin);
            await expect(pageAdmin.getByRole('heading', { name: /^\d{1,2}.*2026$/ })).toBeVisible();

            await expect(pageAdmin).toHaveScreenshot(`planning-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });

        test('graphique des notes (modale, onglet courbe)', async ({ pageAdmin }) => {
            // Même contrôle de RATTRAPAGE que la capture de la grille : ses
            // notes semées ne sont écrites par aucun test, les KPIs et les
            // courbes sont donc reproductibles. L'animation de tracé recharts
            // est coupée dans le composant (`isAnimationActive={false}`) —
            // `animations: 'disabled'` ne gèle que le CSS, pas le JS.
            await allerALaGrilleDeSaisie(pageAdmin, undefined, E2E.controleRattrapage);
            await pageAdmin.getByRole('button', { name: note.noteChartButton.afficherGraphique }).click();
            await expect(pageAdmin.getByRole('dialog')).toBeVisible();
            // Le pointeur reste sur le graphique après le clic d'ouverture et
            // recharts y accroche son tooltip : on l'éloigne avant la capture.
            await pageAdmin.mouse.move(0, 0);

            await expect(pageAdmin).toHaveScreenshot(`note-graphique-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });

        test('dialogue de formulaire ouvert (délibération)', async ({ pageAdmin }) => {
            await allerJusquaPeriode(pageAdmin, 'jury');
            await pageAdmin.getByRole('button', { name: `Délibérer — ${E2E.eleve1}` }).click();
            await expect(pageAdmin.getByRole('dialog')).toBeVisible();

            await expect(pageAdmin).toHaveScreenshot(`jury-deliberer-dialog-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });
    });
}
