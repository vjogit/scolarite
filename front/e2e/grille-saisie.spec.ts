import { test, expect } from './fixtures/roles';
import { E2E, allerALaGrilleDeSaisie } from './aide/hierarchieE2E';

test.describe('Grille de saisie', () => {
    test('trois notes saisies au clavier seul (Entrée entre chaque), rechargement → présentes', async ({ pageSaisie }) => {
        await allerALaGrilleDeSaisie(pageSaisie);

        const saisir = async (eleve: string, valeur: string) => {
            const champ = pageSaisie.getByRole('textbox', { name: `Note de ${eleve}` });
            await champ.fill(valeur);
            await champ.press('Enter');
            await expect(pageSaisie.locator(`[aria-label="Note enregistrée pour ${eleve}"]`)).toBeVisible();
        };

        await saisir(E2E.eleve1, '12');
        await saisir(E2E.eleve2, '14');
        await saisir(E2E.eleve4, '9');

        await pageSaisie.reload();
        await pageSaisie.waitForLoadState('networkidle');
        // Le groupe n'est pas mémorisé par l'URL : le re-choisir après le
        // rechargement fait partie du geste, la grille elle doit refléter ce
        // qui a été enregistré.
        await pageSaisie.getByRole('combobox', { name: 'Groupe' }).click();
        await pageSaisie.getByRole('option', { name: E2E.groupe, exact: true }).click();
        await pageSaisie.waitForLoadState('networkidle');

        await expect(pageSaisie.getByRole('textbox', { name: `Note de ${E2E.eleve1}` })).toHaveValue('12');
        await expect(pageSaisie.getByRole('textbox', { name: `Note de ${E2E.eleve2}` })).toHaveValue('14');
        await expect(pageSaisie.getByRole('textbox', { name: `Note de ${E2E.eleve4}` })).toHaveValue('9');
    });

    test('une valeur hors barème est refusée sur la ligne, sans requête', async ({ pageSaisie }) => {
        await allerALaGrilleDeSaisie(pageSaisie);

        let requeteEnvoyee = false;
        await pageSaisie.route('**/api/v0/resultat/note/controle/**', (route) => {
            requeteEnvoyee = true;
            void route.continue();
        });

        const champ = pageSaisie.getByRole('textbox', { name: `Note de ${E2E.eleve2}` });
        await champ.fill('25');
        await champ.press('Enter');

        const ligne = pageSaisie.getByRole('row', { name: new RegExp(E2E.eleve2) });
        await expect(ligne).toContainText(/comprise|barème/i);
        expect(requeteEnvoyee).toBe(false);
    });

    test('« non évalué » vide et désactive le champ de note', async ({ pageSaisie }) => {
        await allerALaGrilleDeSaisie(pageSaisie);

        // Une ligne éditable, quelle que soit sa valeur courante — les tests
        // de ce fichier partagent le même jeu de données (décision (f)) : ce
        // test vérifie le comportement de la case, pas une valeur de départ
        // qu'un test précédent a pu changer.
        const champNote = pageSaisie.getByRole('textbox', { name: `Note de ${E2E.eleve4}` });
        await expect(champNote).toBeEnabled();

        await pageSaisie.getByRole('checkbox', { name: `Non évalué pour ${E2E.eleve4}` }).check();

        await expect(champNote).toBeDisabled();
        await expect(champNote).toHaveValue('');
    });

    test('le compteur de progression est cohérent avec l\'effectif', async ({ pageSaisie }) => {
        await allerALaGrilleDeSaisie(pageSaisie);
        // Le groupe E2E compte 4 élèves, tous notés (trois valeurs + un non
        // évalué) : la saisie annonce l'effectif complet.
        await expect(pageSaisie.getByText('4/4', { exact: true })).toBeVisible();
    });
});
