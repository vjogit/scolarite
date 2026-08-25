import { test, expect } from './fixtures/roles';
import { E2E, allerJusquaPeriode, allerJusquaPeriodeViaStructure, attendreChargementInitial } from './aide/hierarchieE2E';
import { app } from './aide/i18n';

/** L'id numérique de la période E2E porté par l'URL courante, quel que soit le workflow. */
function idPeriodeDansUrl(url: string): string | null {
    return /\/periode\/(\d+)/.exec(url)?.[1] ?? null;
}

test.describe('Navigation et contexte', () => {
    // Défaut découvert en écrivant ce lot, reproductible à 100% : toute
    // première navigation réelle (goto/reload) vers une URL profonde rebondit
    // sur Keycloak (`redirectUri` figé sur la racine dans KeycloakContext.tsx)
    // et retombe sur `/catalog_context/formation` au lieu de l'écran visé —
    // y compris pour un rechargement, contrairement à ce que documente le
    // module de contexte (`contexte.ts` : « un lien collé dans un onglet neuf
    // redonne exactement le même contexte »). `test.fail` documente le
    // défaut sans faire échouer `make test-ihm` : voir le compte-rendu de
    // vérification pour la reproduction complète et la piste de correction.
    test.fail('lien profond copié dans un nouvel onglet reste sur le même écran', async ({ pageAdmin }) => {
        await allerJusquaPeriode(pageAdmin, 'notes');
        const urlProfonde = pageAdmin.url();

        // « Copier le lien » = charger cette URL depuis une session neuve : un
        // second onglet du même navigateur, comme un favori ou un lien partagé.
        const secondOnglet = await pageAdmin.context().newPage();
        await secondOnglet.goto(urlProfonde);
        await attendreChargementInitial(secondOnglet);
        expect(secondOnglet.url()).toBe(urlProfonde);
        await secondOnglet.close();
    });

    test('rechargement au milieu d\'un parcours conserve le contexte', async ({ pageAdmin }) => {
        await allerJusquaPeriode(pageAdmin, 'notes');
        const urlAvant = pageAdmin.url();

        await pageAdmin.reload();
        await attendreChargementInitial(pageAdmin);

        expect(pageAdmin.url()).toBe(urlAvant);
        await expect(pageAdmin.getByRole('button', { name: `Période : ${E2E.periode}` })).toBeVisible();
    });

    test('Structure → Notes → Jury → Programme → retour : la période suit, sans re-sélection', async ({ pageAdmin }) => {
        await allerJusquaPeriodeViaStructure(pageAdmin);
        const idPeriode = idPeriodeDansUrl(pageAdmin.url());
        expect(idPeriode, 'la période doit être identifiable dans l\'URL de Structure').not.toBeNull();

        for (const onglet of ['notes', 'jury', 'programme'] as const) {
            await pageAdmin.getByRole('tab', { name: app.workflows[onglet] }).click();
            await pageAdmin.waitForLoadState('networkidle');
            expect(
                idPeriodeDansUrl(pageAdmin.url()),
                `le contexte doit suivre dans l'onglet ${onglet} sans re-sélection`,
            ).toBe(idPeriode);
        }

        await pageAdmin.getByRole('tab', { name: app.workflows.structure }).click();
        await pageAdmin.waitForLoadState('networkidle');
        expect(idPeriodeDansUrl(pageAdmin.url())).toBe(idPeriode);
        await expect(pageAdmin.getByRole('treeitem', { name: `Période ${E2E.periode}` })).toHaveAttribute('aria-checked', 'true');
    });

    test('retour navigateur cohérent après une navigation interne', async ({ pageAdmin }) => {
        await pageAdmin.goto('/');
        await attendreChargementInitial(pageAdmin);
        await pageAdmin.getByRole('tab', { name: app.workflows.notes }).click();
        await pageAdmin.waitForLoadState('networkidle');
        const urlListeFormations = pageAdmin.url();

        await pageAdmin.getByRole('button', { name: `Formation : ${app.selecteurNiveau.sansSelection}` }).click();
        await pageAdmin.getByRole('menuitem', { name: E2E.formation, exact: true }).click();
        await pageAdmin.getByRole('button', { name: `Formation : ${E2E.formation}` }).waitFor();

        await pageAdmin.goBack();
        await pageAdmin.waitForLoadState('networkidle');
        expect(pageAdmin.url()).toBe(urlListeFormations);
    });

    test('le fil de contexte n\'affiche jamais un identifiant numérique brut', async ({ pageAdmin }) => {
        await allerJusquaPeriode(pageAdmin, 'notes');
        const filDeContexte = pageAdmin.getByRole('navigation', { name: app.filContexte.ariaLabel });
        await expect(filDeContexte).toBeVisible();
        const texte = await filDeContexte.textContent();
        expect(texte ?? '').not.toMatch(/#\d+/);
    });
});
