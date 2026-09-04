import { test, expect } from './fixtures/roles';
import {
    E2E, allerSurFormationViaStructure, allerSurOptionViaStructure, allerSurPromotionViaStructure,
    attendreChargementInitial,
} from './aide/hierarchieE2E';
import { app, crud, interpoler, titreSuppression } from './aide/i18n';

/**
 * Captures d'états OUVERTS — le complément de `captures.spec.ts`, qui ne
 * photographie que des écrans au repos. Motif (lot 4ter) : les quatre défauts
 * graves des lots 3 à 4bis vivaient tous derrière une surface fermée par
 * défaut — menu de compte qui plantait au montage, menu d'actions à la
 * largeur cassée, clé i18n brute dans un menu jamais ouvert. Quatre surfaces,
 * deux modes ; même protocole de réacceptation que `captures.spec.ts` :
 * REGARDER chaque image avant `--update-snapshots`.
 *
 * Déterminisme, en plus des règles de `captures.spec.ts` :
 *  - Ce fichier est STRICTEMENT SANS ÉCRITURE : il ouvre des menus et des
 *    dialogues puis les referme, aucune mutation serveur. Il peut donc
 *    s'exécuter avant ou après `captures.spec.ts` sans influer sur lui.
 *    Son nom le place (ordre alphabétique, `workers: 1`) AVANT les specs qui
 *    mutent l'état semé (`corbeille`, `grille-saisie`, `i18n`) : les nombres
 *    que la modale de suppression affiche (cascade calculée par le serveur)
 *    sont ceux du seed, identiques à chaque exécution. Ne pas renommer ce
 *    fichier au-delà de `co…` sans revérifier cette propriété.
 *  - La souris est ÉLOIGNÉE avant chaque capture (`mouse.move(0, 0)`) : le
 *    pointeur reste sinon sur le déclencheur après le clic d'ouverture — état
 *    de survol sur l'entrée de menu sous-jacente, et infobulle du bouton ⋮
 *    encore affichée (piège du lot 4bis, version popup). L'absence
 *    d'infobulle est affirmée explicitement avant de photographier.
 *  - Les modales de suppression ne sont capturées qu'une fois l'analyse
 *    d'impact RÉSOLUE (l'alerte de cascade visible, le libellé « Analyse de
 *    l'impact en cours… » absent) : photographier pendant la requête
 *    capturerait un spinner, à l'état d'avancement non reproductible.
 */

const MODES = ['light', 'dark'] as const;

for (const colorScheme of MODES) {
    test.describe(`Captures ouvertes (${colorScheme})`, () => {
        test.beforeEach(async ({ pageAdmin }) => {
            await pageAdmin.emulateMedia({ colorScheme });
        });

        test('menu d\'actions déployé (navigation + bloc destructif)', async ({ pageAdmin }) => {
            await allerSurFormationViaStructure(pageAdmin);
            await pageAdmin.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: E2E.formation }) }).click();

            const menu = pageAdmin.getByRole('menu');
            await expect(menu).toBeVisible();
            // Le bloc destructif, derrière son séparateur — la surface dont la
            // largeur avait cassé au lot 4.
            await expect(menu.getByRole('menuitem', { name: crud.actions.supprimer })).toBeVisible();

            await pageAdmin.mouse.move(0, 0);
            await expect(pageAdmin.getByRole('tooltip')).toHaveCount(0);

            await expect(pageAdmin).toHaveScreenshot(`menu-actions-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });

        test('dialogue de suppression simple (focus sur Annuler)', async ({ pageAdmin }) => {
            await allerSurOptionViaStructure(pageAdmin, E2E.option);
            await pageAdmin.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: E2E.option }) }).click();
            await pageAdmin.getByRole('menuitem', { name: crud.actions.supprimer }).click();

            const dialogue = pageAdmin.getByRole('dialog', { name: titreSuppression(crud.entites.option.nomAvecArticle, E2E.option) });
            await expect(dialogue).toBeVisible();
            // L'analyse d'impact doit être résolue : cascade affichée, spinner parti.
            await expect(dialogue.getByRole('alert').first()).toContainText(E2E.option);
            await expect(dialogue.getByText(crud.deleteDialog.analyseEnCours)).toHaveCount(0);
            // Pas de saisie exigée ici — c'est le dialogue « simple ».
            await expect(dialogue.getByLabel(crud.deleteDialog.confirmationLabel)).toHaveCount(0);

            await pageAdmin.mouse.move(0, 0);
            await expect(pageAdmin.getByRole('tooltip')).toHaveCount(0);

            await expect(pageAdmin).toHaveScreenshot(`dialogue-suppression-simple-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });

        test('dialogue de suppression avec saisie de confirmation', async ({ pageAdmin }) => {
            // La promotion exige la saisie dès l'ouverture
            // (`deleteRequiresNameConfirmation`, entites/promotion.ts) — le même
            // écran que produit une cascade au-delà de `SEUIL_CONFIRMATION`.
            // « E2E Promotion Vide » précisément : formation et promotion
            // principales contiennent la période délibérée, leur suppression est
            // BLOQUÉE et l'état bloqué masque la saisie (`!estBloque &&
            // confirmationRequise`, DeleteConfirmDialog.tsx). Seule une entité à
            // confirmation non bloquée montre cette surface — d'où son ajout au
            // seed (lot 4ter, validé).
            await allerSurPromotionViaStructure(pageAdmin, E2E.promotionVide);
            await pageAdmin.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: E2E.promotionVide }) }).click();
            await pageAdmin.getByRole('menuitem', { name: crud.actions.supprimer }).click();

            const dialogue = pageAdmin.getByRole('dialog', { name: titreSuppression(crud.entites.promotion.nomAvecArticle, E2E.promotionVide) });
            await expect(dialogue).toBeVisible();
            // Impact résolu : promotion sans descendance, « Aucune donnée liée ».
            await expect(dialogue.getByText(crud.deleteDialog.aucuneDonneeLiee)).toBeVisible();
            await expect(dialogue.getByText(crud.deleteDialog.analyseEnCours)).toHaveCount(0);
            await expect(dialogue.getByLabel(crud.deleteDialog.confirmationLabel)).toBeVisible();

            await pageAdmin.mouse.move(0, 0);
            await expect(pageAdmin.getByRole('tooltip')).toHaveCount(0);

            await expect(pageAdmin).toHaveScreenshot(`dialogue-suppression-confirmation-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });

        test('menu de compte du shell', async ({ pageAdmin }) => {
            // La surface qui plantait au montage au lot 3 (Base UI erreur #31)
            // avec 45 tests verts — aucun test ne l'ouvrait.
            await pageAdmin.goto('/');
            await attendreChargementInitial(pageAdmin);
            await pageAdmin.getByRole('button', { name: app.shell.compte }).click();

            const menu = pageAdmin.getByRole('menu');
            await expect(menu).toBeVisible();
            await expect(menu.getByRole('menuitem', { name: app.nav.deconnexion })).toBeVisible();

            await pageAdmin.mouse.move(0, 0);
            await expect(pageAdmin.getByRole('tooltip')).toHaveCount(0);

            await expect(pageAdmin).toHaveScreenshot(`menu-compte-${colorScheme}.png`, {
                animations: 'disabled',
            });
        });
    });
}
