import { test, expect } from './fixtures/roles';
import {
    E2E, allerALaCorbeille, allerALaGrilleDeSaisie, allerSurOptionViaStructure, carteCorbeille,
} from './aide/hierarchieE2E';

test.describe('Suppression et corbeille', () => {
    test('la modale de suppression nomme l\'objet et chiffre la cascade ; période délibérée → refus', async ({ pageAdmin }) => {
        await allerSurOptionViaStructure(pageAdmin, E2E.optionDeliberee);
        await pageAdmin.getByRole('button', { name: `Actions — ${E2E.optionDeliberee}` }).click();
        await pageAdmin.getByRole('menuitem', { name: 'Supprimer' }).click();

        const dialogue = pageAdmin.getByRole('dialog', { name: `Supprimer l'option « ${E2E.optionDeliberee} » ?` });
        await expect(dialogue).toBeVisible();
        await expect(dialogue.getByRole('alert')).toContainText('jury délibéré');
        await expect(dialogue.getByRole('button', { name: 'Supprimer' })).toBeDisabled();
    });

    test('suppression, restauration : tout revient, la grille retrouve son effectif', async ({ pageAdmin }) => {
        await allerSurOptionViaStructure(pageAdmin, E2E.optionSacrificielle);
        await pageAdmin.getByRole('button', { name: `Actions — ${E2E.optionSacrificielle}` }).click();
        await pageAdmin.getByRole('menuitem', { name: 'Supprimer' }).click();

        const dialogueSuppression = pageAdmin.getByRole('dialog', { name: `Supprimer l'option « ${E2E.optionSacrificielle} » ?` });
        await expect(dialogueSuppression.getByRole('alert').first()).toContainText(E2E.optionSacrificielle);
        await dialogueSuppression.getByRole('button', { name: 'Supprimer' }).click();
        // Disparue du sélecteur de contexte de Structure (l'arbre) — la même
        // invalidation de cache vaut pour tout autre sélecteur de contexte
        // de l'application (voir Corbeille.tsx : `invalidateQueries()` sans
        // périmètre, justement pour ça).
        await expect(pageAdmin.getByRole('treeitem', { name: `Option ${E2E.optionSacrificielle}` })).toHaveCount(0);

        await allerALaCorbeille(pageAdmin);
        const carte = carteCorbeille(pageAdmin, `Option « ${E2E.optionSacrificielle} »`);
        await carte.getByRole('button', { name: 'Restaurer' }).click();
        await pageAdmin.getByRole('dialog').getByRole('button', { name: 'Restaurer' }).click();
        await expect(pageAdmin.getByRole('heading', { name: `Option « ${E2E.optionSacrificielle} »` })).toHaveCount(0);

        await allerALaGrilleDeSaisie(
            pageAdmin, 'E2E Groupe Sacrificiel', 'E2E Controle Sacrificiel',
            E2E.optionSacrificielle, E2E.periodeSacrificielle, 'E2E UE Sacrificielle', 'E2E Matiere Sacrificielle',
        );
        await expect(pageAdmin.getByText('1/1', { exact: true })).toBeVisible();
    });

    test('purge : la saisie du nom débloque, la purge est irréversible', async ({ pageAdmin }) => {
        await allerSurOptionViaStructure(pageAdmin, E2E.optionSacrificielle);
        await pageAdmin.getByRole('button', { name: `Actions — ${E2E.optionSacrificielle}` }).click();
        await pageAdmin.getByRole('menuitem', { name: 'Supprimer' }).click();
        await pageAdmin.getByRole('dialog', { name: `Supprimer l'option « ${E2E.optionSacrificielle} » ?` })
            .getByRole('button', { name: 'Supprimer' }).click();
        await expect(pageAdmin.getByRole('treeitem', { name: `Option ${E2E.optionSacrificielle}` })).toHaveCount(0);

        await allerALaCorbeille(pageAdmin);
        const carte = carteCorbeille(pageAdmin, `Option « ${E2E.optionSacrificielle} »`);
        await carte.getByRole('button', { name: 'Purger' }).click();

        const dialoguePurge = pageAdmin.getByRole('dialog', { name: `Purger Option « ${E2E.optionSacrificielle} » ?` });
        const boutonPurger = dialoguePurge.getByRole('button', { name: 'Purger définitivement' });
        await expect(boutonPurger).toBeDisabled();

        await dialoguePurge.getByLabel('Confirmation').fill(E2E.optionSacrificielle);
        await expect(boutonPurger).toBeEnabled();
        await boutonPurger.click();

        await expect(pageAdmin.getByRole('heading', { name: `Option « ${E2E.optionSacrificielle} »` })).toHaveCount(0);
    });
});
