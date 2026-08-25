import { test, expect } from './fixtures/roles';
import { allerALaGrilleDeSaisie } from './aide/hierarchieE2E';
import { genererFicheFautive, nettoyerFicheFautive } from './aide/ficheFautive';
import { app } from './aide/i18n';

test.describe('Erreurs d\'import', () => {
    test('une fiche avec lignes fautives affiche le tableau des lignes refusées, aucune note écrite', async ({ pageSaisie }) => {
        await allerALaGrilleDeSaisie(pageSaisie);
        const controleId = Number(/\/controle\/(\d+)\/note$/.exec(pageSaisie.url())?.[1]);
        expect(controleId).toBeGreaterThan(0);

        const avant = await Promise.all(
            ['Note de Eleve1 E2E', 'Note de Eleve2 E2E', 'Note de Eleve4 E2E']
                .map((libelle) => pageSaisie.getByRole('textbox', { name: libelle }).inputValue()),
        );

        const fiche = genererFicheFautive(controleId);
        try {
            const fileChooser = pageSaisie.waitForEvent('filechooser');
            await pageSaisie.getByRole('button', { name: 'Importer les notes depuis Excel' }).click();
            await (await fileChooser).setFiles(fiche);

            const dialogue = pageSaisie.getByRole('dialog', { name: app.lignesRefusees.titre });
            await expect(dialogue).toBeVisible();
            const table = dialogue.getByRole('table', { name: app.lignesRefusees.tableAriaLabel });
            await expect(table).toBeVisible();

            const lignes = table.getByRole('row');
            // En-tête + deux lignes fautives.
            await expect(lignes).toHaveCount(3);
            await expect(table).toContainText('14');
            await expect(table).toContainText('15');
            await expect(table).toContainText(/hors barème/i);
            await expect(table).toContainText(/n'est pas une note/i);

            await dialogue.getByRole('button', { name: app.lignesRefusees.fermer }).click();
        } finally {
            nettoyerFicheFautive(fiche);
        }

        // Aucune note écrite : les valeurs de la grille n'ont pas bougé.
        const apres = await Promise.all(
            ['Note de Eleve1 E2E', 'Note de Eleve2 E2E', 'Note de Eleve4 E2E']
                .map((libelle) => pageSaisie.getByRole('textbox', { name: libelle }).inputValue()),
        );
        expect(apres).toEqual(avant);
    });
});
