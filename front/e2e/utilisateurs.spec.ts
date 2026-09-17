import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { attendreChargementInitial } from './aide/hierarchieE2E';
import { app, crud, interpoler } from './aide/i18n';
import user from '../src/i18n/locales/fr/user.json' with { type: 'json' };

/**
 * La colonne « Rôles » de la liste des utilisateurs dit les rôles Keycloak
 * de chaque compte (défaut consigné au lot 13 : la liste ne les livrait
 * pas, la colonne restait vide ; fermé au lot de nettoyage du 17 septembre
 * 2026 — la liste les lit par rôle, dix appels bornés).
 *
 * Aucun compte du seed n'est en base avec un compte Keycloak (`seed.sql` ne
 * peut pas en créer) : la spec crée son agent par l'écran, avec un rôle, lit
 * la colonne, puis le supprime — compte Keycloak compris, par le DELETE de
 * l'application. Un reliquat d'une exécution interrompue est supprimé avant
 * de commencer, pour que la spec se reproduise. Le nom ne fait d'aucun nom
 * du seed un préfixe, et aucun nom du seed n'en est un.
 */
const NOM = 'E2E Roles';
const PRENOM = 'Agent';
const EMAIL = 'e2e-roles@test.invalid';

async function allerAuxUtilisateurs(page: Page): Promise<void> {
    await page.goto('/');
    await attendreChargementInitial(page);
    await page.getByRole('link', { name: app.nav.utilisateur }).click();
    await expect(page.getByRole('heading', { name: crud.entites.user.title })).toBeVisible();
    await page.waitForLoadState('networkidle');
}

/** Coche la ligne de l'agent et confirme la suppression ; attend sa disparition. */
async function supprimerAgent(page: Page): Promise<void> {
    await page.getByRole('row', { name: NOM }).getByRole('checkbox', { name: crud.table.selectionnerLigne }).check();
    await page.getByRole('button', { name: crud.actions.supprimerSelection }).click();
    const dialogue = page.getByRole('dialog');
    await expect(dialogue).toBeVisible();
    await dialogue.getByRole('button', { name: crud.deleteDialog.supprimer }).click();
    await expect(page.getByRole('row', { name: NOM })).toHaveCount(0);
}

test.describe('Utilisateurs — colonne des rôles', () => {
    test("un agent créé avec un rôle l'affiche dans la liste, puis disparaît avec son compte", async ({ pageAdmin }) => {
        await allerAuxUtilisateurs(pageAdmin);
        if (await pageAdmin.getByRole('row', { name: NOM }).count() > 0) await supprimerAgent(pageAdmin);

        await pageAdmin.getByRole('button', { name: interpoler(crud.creationInvite, { nom: crud.entites.user.nom }) }).first().click();
        await expect(pageAdmin.getByRole('heading', { name: crud.form.titreAjouter })).toBeVisible();
        await pageAdmin.getByLabel(user.champs.prenom, { exact: true }).fill(PRENOM);
        await pageAdmin.getByLabel(user.champs.nom, { exact: true }).fill(NOM);
        await pageAdmin.getByLabel(user.champs.email, { exact: true }).fill(EMAIL);
        await pageAdmin.getByRole('checkbox', { name: user.roles.CONSULTATION }).check();
        await pageAdmin.getByRole('checkbox', { name: user.roles.NOTES_ECRITURE }).check();
        await pageAdmin.getByRole('button', { name: crud.form.ajouter }).click();

        // Retour à la liste : la ligne porte ses deux rôles, libellés et dans
        // l'ordre de la liste fermée du serveur — pas celui des clics.
        await expect(pageAdmin.getByRole('heading', { name: crud.entites.user.title })).toBeVisible();
        const ligne = pageAdmin.getByRole('row', { name: NOM });
        await expect(ligne).toBeVisible();
        await expect(ligne.getByRole('cell', { name: `${user.roles.CONSULTATION}, ${user.roles.NOTES_ECRITURE}`, exact: true })).toBeVisible();
        // Un agent du seed, sans compte Keycloak, n'a rien dans la colonne.
        const agentSeed = pageAdmin.getByRole('row', { name: 'E2E Agent1' });
        await expect(agentSeed).toBeVisible();
        await expect(agentSeed.getByRole('cell', { name: user.roles.CONSULTATION })).toHaveCount(0);

        await supprimerAgent(pageAdmin);
    });
});
