import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import {
    E2E, allerJusquaPeriodeViaStructure, allerSurOptionViaStructure, boutonActionsLigne, cliquerPuisAttendreUrl,
} from './aide/hierarchieE2E';
import { crud, ligneImpact, nomImpact, titreSuppression } from './aide/i18n';

/**
 * Correction A1 (17 septembre 2026) : les analyses d'impact de suppression
 * comptent les données syllabus — la fiche d'une matière, les liaisons de
 * compétences d'une UE — et l'UE comme la matière ont désormais leur propre
 * analyse (suppression physique : « Tout sera définitivement supprimé »).
 *
 * Les lignes de cascade sont traduites par le front depuis la clé stable que
 * le serveur livre (`entity` + `count`, lot correction-langue du 17 septembre
 * 2026) : leurs libellés viennent du bloc `impact` de crud.json, par
 * `ligneImpact`, jamais en clair.
 *
 * État semé : « E2E UE1 » porte une liaison (C1) et sa matière « E2E Matiere »
 * une fiche ; « E2E UE Deliberee » n'a ni matière, ni fiche, ni liaison.
 * Aucune écriture : chaque dialogue est refermé par « Annuler ».
 */

const FICHE = ligneImpact('syllabus_matiere', 1);
const LIAISON = ligneImpact('ue_competence', 1);

/** Ouvre le dialogue de suppression du nœud courant du bandeau, par son menu d'actions. */
async function ouvrirSuppression(page: Page, nomNoeud: string, nomAvecArticle: string) {
    await boutonActionsLigne(page, nomNoeud).click();
    await page.getByRole('menuitem', { name: crud.actions.supprimer }).click();
    const dialogue = page.getByRole('dialog', { name: titreSuppression(nomAvecArticle, nomNoeud) });
    await expect(dialogue).toBeVisible();
    await expect(dialogue.getByText(crud.deleteDialog.analyseEnCours)).toHaveCount(0);
    return dialogue;
}

async function allerSurUeViaStructure(page: Page, option: string, periode: string, ue: string) {
    await allerJusquaPeriodeViaStructure(page, option, periode);
    const treeUe = page.getByRole('treeitem', { name: `UE ${ue}`, exact: true });
    await cliquerPuisAttendreUrl(page, () => treeUe.click(), /\/ue\/\d+$/);
}

test.describe('Analyse d\'impact — données syllabus', () => {
    test('option : la fiche et la liaison du sous-arbre sont annoncées, en corbeille', async ({ pageAdmin }) => {
        await allerSurOptionViaStructure(pageAdmin, E2E.option);
        const dialogue = await ouvrirSuppression(pageAdmin, E2E.option, crud.entites.option.nomAvecArticle);
        const alerte = dialogue.getByRole('alert').first();
        await expect(alerte).toContainText(FICHE);
        await expect(alerte).toContainText(LIAISON);
        await expect(alerte).toContainText(crud.deleteDialog.cascadeCorbeille);
        await dialogue.getByRole('button', { name: crud.deleteDialog.annuler }).click();
        await expect(dialogue).toHaveCount(0);
    });

    test('UE : ses matières, leurs fiches et ses liaisons, définitivement', async ({ pageAdmin }) => {
        await allerSurUeViaStructure(pageAdmin, E2E.option, E2E.periode, E2E.ue);
        const dialogue = await ouvrirSuppression(pageAdmin, E2E.ue, crud.entites.ue.nomAvecArticle);
        const alerte = dialogue.getByRole('alert').first();
        await expect(alerte).toContainText(ligneImpact('matiere', 1));
        await expect(alerte).toContainText(FICHE);
        await expect(alerte).toContainText(LIAISON);
        await expect(alerte).toContainText(crud.deleteDialog.cascadeDefinitive);
        await dialogue.getByRole('button', { name: crud.deleteDialog.annuler }).click();
        await expect(dialogue).toHaveCount(0);
    });

    test('matière : sa fiche est annoncée, jamais une liaison', async ({ pageAdmin }) => {
        await allerSurUeViaStructure(pageAdmin, E2E.option, E2E.periode, E2E.ue);
        const treeMatiere = pageAdmin.getByRole('treeitem', { name: `Matière ${E2E.matiere}`, exact: true });
        await cliquerPuisAttendreUrl(pageAdmin, () => treeMatiere.click(), /\/matiere\/\d+$/);
        const dialogue = await ouvrirSuppression(pageAdmin, E2E.matiere, crud.entites.matiere.nomAvecArticle);
        const alerte = dialogue.getByRole('alert').first();
        await expect(alerte).toContainText(FICHE);
        await expect(alerte).toContainText(ligneImpact('controle', 2));
        await expect(alerte).not.toContainText(nomImpact('ue_competence', 1));
        await expect(alerte).not.toContainText(nomImpact('ue_competence', 2));
        await expect(alerte).toContainText(crud.deleteDialog.cascadeDefinitive);
        await dialogue.getByRole('button', { name: crud.deleteDialog.annuler }).click();
        await expect(dialogue).toHaveCount(0);
    });

    test('UE sans donnée syllabus : aucune ligne fiche ni liaison', async ({ pageAdmin }) => {
        await allerSurUeViaStructure(pageAdmin, E2E.optionDeliberee, 'E2E Periode Deliberee', 'E2E UE Deliberee');
        const dialogue = await ouvrirSuppression(pageAdmin, 'E2E UE Deliberee', crud.entites.ue.nomAvecArticle);
        for (const nombre of [1, 2]) {
            await expect(dialogue).not.toContainText(nomImpact('syllabus_matiere', nombre));
            await expect(dialogue).not.toContainText(nomImpact('ue_competence', nombre));
        }
        await dialogue.getByRole('button', { name: crud.deleteDialog.annuler }).click();
        await expect(dialogue).toHaveCount(0);
    });
});
