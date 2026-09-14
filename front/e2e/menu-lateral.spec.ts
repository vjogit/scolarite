import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { attendreChargementInitial } from './aide/hierarchieE2E';
import { app } from './aide/i18n';

/**
 * Le menu latéral en mode icône. Le groupe « Admin » est un Collapsible dont
 * l'intitulé est le déclencheur ; shadcn masque cet intitulé en mode icône
 * par `-mt-8 opacity-0`, ce qui en faisait un bouton invisible posé sur
 * l'entrée « Scolarité » : un clic sur « Scolarité » repliait « Admin », dont
 * les entrées disparaissaient sans déclencheur pour les ramener (constaté au
 * navigateur, 14 septembre 2026). Ces tests garantissent que le déclencheur
 * n'existe plus en mode icône et que les entrées du groupe y restent.
 */
test.describe('Menu latéral en mode icône', () => {
    // Le rail de la sidebar porte le même nom accessible que le bouton de
    // l'en-tête : seul ce dernier, dans `main`, est celui de l'utilisateur.
    const boutonBascule = (page: Page) => page.getByRole('main').getByRole('button', { name: app.shell.basculerMenu });
    const entreesAdmin = [app.nav.salle, app.nav.utilisateur, app.nav.corbeille, app.nav.registre];

    test('« Scolarité » en mode icône ne replie pas le groupe Admin', async ({ pageAdmin }) => {
        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        const declencheurAdmin = pageAdmin.getByRole('button', { name: app.nav.admin });
        await expect(declencheurAdmin).toBeVisible();

        await boutonBascule(pageAdmin).click();
        // Plus de bouton fantôme : ni visible, ni dans l'arbre accessible.
        await expect(declencheurAdmin).toBeHidden();

        // Le clic atteint bien le lien — « Scolarité » ramène à la tâche en
        // cours, la Structure en session neuve (RetourScolarite) — et les
        // entrées du groupe sont toujours là.
        await pageAdmin.getByRole('link', { name: app.nav.scolarite }).click();
        await expect(pageAdmin).toHaveURL(/\/catalog_context\/formation$/);
        for (const nom of entreesAdmin) {
            await expect(pageAdmin.getByRole('link', { name: nom })).toBeVisible();
        }

        await boutonBascule(pageAdmin).click();
        await expect(declencheurAdmin).toBeVisible();
        for (const nom of entreesAdmin) {
            await expect(pageAdmin.getByRole('link', { name: nom })).toBeVisible();
        }
    });

    test('un groupe replié en mode large montre ses icônes en mode icône, et se retrouve replié au retour', async ({ pageAdmin }) => {
        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        const declencheurAdmin = pageAdmin.getByRole('button', { name: app.nav.admin });
        const salle = pageAdmin.getByRole('link', { name: app.nav.salle });

        await declencheurAdmin.click();
        await expect(salle).toBeHidden();

        await boutonBascule(pageAdmin).click();
        await expect(declencheurAdmin).toBeHidden();
        await expect(salle).toBeVisible();

        await boutonBascule(pageAdmin).click();
        await expect(declencheurAdmin).toBeVisible();
        await expect(salle).toBeHidden();
    });
});
