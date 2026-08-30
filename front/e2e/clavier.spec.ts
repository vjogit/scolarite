import { test, expect } from './fixtures/roles';
import {
    E2E, allerSurFormationViaStructure, allerSurOptionViaStructure, allerSurPromotionViaStructure,
    attendreChargementInitial,
} from './aide/hierarchieE2E';
import { app, crud, interpoler, structure, titreSuppression } from './aide/i18n';

/**
 * Navigation au clavier des surfaces crud — rien ne surveillait cette
 * régression, alors que `services/crud/focus.ts` gère le focus explicitement
 * et que les lots 5 à 17 vont remplacer chaque composant qui le consomme.
 *
 * Ce que ces tests fixent (constaté à l'écran au lot 4) :
 *  - dialogue de suppression AVEC saisie → le focus entre dans la saisie ;
 *  - dialogue simple → le focus entre sur « Annuler » ;
 *  - la tabulation circule dans le dialogue (piège à focus), Échap ferme et
 *    rend le focus au déclencheur ;
 *  - le menu d'actions s'ouvre, se parcourt et se ferme au clavier — la
 *    régression d'accessibilité classique au remplacement d'un menu ;
 *  - à l'ouverture d'un formulaire de saisie, le focus va au premier champ
 *    (`premierChampSaisissable`, focus.ts).
 *
 * Aucune écriture : les dialogues sont refermés par Échap, le formulaire est
 * quitté sans soumission.
 */

test.describe('Navigation au clavier', () => {
    test('le menu d\'actions s\'ouvre, se parcourt et se ferme au clavier', async ({ pageAdmin }) => {
        await allerSurFormationViaStructure(pageAdmin);
        const declencheur = pageAdmin.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: E2E.formation }) });
        await declencheur.focus();
        await pageAdmin.keyboard.press('Enter');

        const menu = pageAdmin.getByRole('menu');
        await expect(menu).toBeVisible();

        // Ouverture au clavier : Base UI focalise d'emblée la première entrée
        // (constaté à l'exécution — pas après une première flèche).
        await expect(menu.getByRole('menuitem', { name: crud.entites.actions.gererPromotions })).toBeFocused();
        // La flèche basse descend jusqu'au bloc destructif en queue de menu
        // (Gérer les promotions → Créer une promotion → Supprimer).
        await pageAdmin.keyboard.press('ArrowDown');
        await pageAdmin.keyboard.press('ArrowDown');
        await expect(menu.getByRole('menuitem', { name: crud.actions.supprimer })).toBeFocused();

        // Échap referme sans choisir, et rend le focus au déclencheur.
        await pageAdmin.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(declencheur).toBeFocused();
    });

    test('dialogue avec saisie : le focus entre dans la saisie, Échap ferme', async ({ pageAdmin }) => {
        // « E2E Promotion Vide » : la seule entité à confirmation de nom dont la
        // suppression n'est pas bloquée (voir captures-ouvertes.spec.ts).
        await allerSurPromotionViaStructure(pageAdmin, E2E.promotionVide);
        await pageAdmin.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: E2E.promotionVide }) }).click();
        await pageAdmin.getByRole('menuitem', { name: crud.actions.supprimer }).click();

        const dialogue = pageAdmin.getByRole('dialog', { name: titreSuppression(crud.entites.promotion.nomAvecArticle, E2E.promotionVide) });
        await expect(dialogue).toBeVisible();
        // `initialFocus` : la saisie de confirmation, exigée dès l'ouverture.
        await expect(dialogue.getByLabel(crud.deleteDialog.confirmationLabel)).toBeFocused();

        await pageAdmin.keyboard.press('Escape');
        await expect(dialogue).toHaveCount(0);
    });

    test('dialogue simple : focus sur Annuler, tabulation en boucle, Échap rend le focus', async ({ pageAdmin }) => {
        await allerSurOptionViaStructure(pageAdmin, E2E.option);
        const declencheur = pageAdmin.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: E2E.option }) });
        await declencheur.click();
        await pageAdmin.getByRole('menuitem', { name: crud.actions.supprimer }).click();

        const dialogue = pageAdmin.getByRole('dialog', { name: titreSuppression(crud.entites.option.nomAvecArticle, E2E.option) });
        await expect(dialogue).toBeVisible();
        const annuler = dialogue.getByRole('button', { name: crud.deleteDialog.annuler });
        const supprimer = dialogue.getByRole('button', { name: crud.deleteDialog.supprimer });
        // Pas de saisie exigée : le focus entre sur « Annuler » (la parité de
        // l'`autoFocus` MUI).
        await expect(annuler).toBeFocused();

        // « Supprimer » n'est tabulable qu'une fois l'analyse d'impact rendue.
        await expect(supprimer).toBeEnabled();
        await pageAdmin.keyboard.press('Tab');
        await expect(supprimer).toBeFocused();
        // Le piège à focus boucle dans le dialogue au lieu de s'échapper vers
        // la page.
        await pageAdmin.keyboard.press('Tab');
        await expect(annuler).toBeFocused();

        await pageAdmin.keyboard.press('Escape');
        await expect(dialogue).toHaveCount(0);
        await expect(declencheur).toBeFocused();
    });

    test('formulaire de saisie : le focus va au premier champ', async ({ pageAdmin }) => {
        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        await pageAdmin.getByRole('tab', { name: app.workflows.structure }).click();
        await pageAdmin.waitForLoadState('networkidle');
        await pageAdmin.getByRole('button', { name: 'Créer une formation' }).first().click();

        await expect(pageAdmin.getByRole('heading', { name: crud.form.titreAjouter })).toBeVisible();
        // `premierChampSaisissable` (focus.ts) : la saisie commence sans clic.
        await expect(pageAdmin.getByLabel(structure.formation.champTitre)).toBeFocused();
    });
});
