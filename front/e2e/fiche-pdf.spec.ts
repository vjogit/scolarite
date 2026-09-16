import type { Download, Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { E2E, allerAuSyllabusViaStructure, allerSurPromotionViaStructure, attendreChargementInitial } from './aide/hierarchieE2E';
import { app, crud, interpoler, syllabus } from './aide/i18n';
import syllabusEn from '../src/i18n/locales/en/syllabus.json' with { type: 'json' };
import appEn from '../src/i18n/locales/en/app.json' with { type: 'json' };

/**
 * Les documents PDF du syllabus (lot 5, décision 5) : le bouton de la fiche
 * sur l'écran syllabus de l'UE et l'action de ligne du livret sur la
 * promotion déclenchent un téléchargement — événement, nom de fichier annoncé
 * par le serveur (langue comprise), en-tête `%PDF` — sans jamais ouvrir le
 * document : sa mise en page se vérifie sur le gabarit, en Go. Sous
 * CONSULTATION : une lecture, ouverte à tous les rôles.
 *
 * Aucune dépendance d'état : rien n'est écrit, le seed suffit.
 */

/** Les premiers octets du fichier reçu, sans le garder. */
async function enTete(download: Download): Promise<string> {
    const flux = await download.createReadStream();
    return new Promise<string>((resolve, reject) => {
        flux.once('data', (morceau: Buffer | string) => {
            flux.destroy();
            resolve(String(morceau).slice(0, 4));
        });
        flux.once('error', reject);
        flux.once('end', () => { resolve(''); });
    });
}

async function telechargerParClic(page: Page, cliquer: () => Promise<void>): Promise<Download> {
    const attente = page.waitForEvent('download');
    await cliquer();
    return attente;
}

test.describe('Syllabus — fiche et livret PDF', () => {
    test('CONSULTATION télécharge la fiche PDF de l\'UE, en français', async ({ pageConsultation }) => {
        await allerAuSyllabusViaStructure(pageConsultation, 'ue');
        await expect(pageConsultation.getByRole('heading', { name: syllabus.ue.titre })).toBeVisible();

        const bouton = pageConsultation.getByRole('button', { name: syllabus.fiche.telecharger });
        const download = await telechargerParClic(pageConsultation, () => bouton.click());

        expect(download.suggestedFilename()).toBe('syllabus-ue-e2e-ue1-fr.pdf');
        expect(await enTete(download)).toBe('%PDF');
        // Le bouton revient disponible une fois le fichier remis.
        await expect(bouton).toBeEnabled();
    });

    test('CONSULTATION télécharge le livret PDF de la promotion depuis sa ligne', async ({ pageConsultation }) => {
        await allerSurPromotionViaStructure(pageConsultation, E2E.promotion);
        // L'action vit dans le menu du bandeau du nœud sélectionné (la première
        // action, « Gérer les options », est promue en bouton direct), comme
        // sur la ligne de la liste des promotions.
        await pageConsultation.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: E2E.promotion }) }).click();
        const entree = pageConsultation.getByRole('menuitem', { name: syllabus.livret.action });
        await expect(entree).toBeVisible();

        const download = await telechargerParClic(pageConsultation, () => entree.click());

        expect(download.suggestedFilename()).toBe('syllabus-livret-e2e-promotion-fr.pdf');
        expect(await enTete(download)).toBe('%PDF');
        // Rien n'a changé à l'écran : un rappel, pas une navigation.
        await expect(pageConsultation).toHaveURL(/\/promotion\/\d+$/);
    });

    test('la langue de l\'interface est celle des libellés du document', async ({ pageAdmin }) => {
        await allerAuSyllabusViaStructure(pageAdmin, 'ue');
        await pageAdmin.getByRole('button', { name: app.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'English' }).click();

        const bouton = pageAdmin.getByRole('button', { name: syllabusEn.fiche.telecharger });
        const download = await telechargerParClic(pageAdmin, () => bouton.click());
        expect(download.suggestedFilename()).toBe('syllabus-ue-e2e-ue1-en.pdf');
        expect(await enTete(download)).toBe('%PDF');

        await pageAdmin.getByRole('button', { name: appEn.langueAriaLabel }).click();
        await pageAdmin.getByRole('menuitem', { name: 'Français' }).click();
        await expect(pageAdmin.getByRole('button', { name: syllabus.fiche.telecharger })).toBeVisible();
        await attendreChargementInitial(pageAdmin);
    });
});
