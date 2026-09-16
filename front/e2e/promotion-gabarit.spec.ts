import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/roles';
import { E2E, allerAuSyllabusViaStructure, allerSurFormationViaStructure } from './aide/hierarchieE2E';
import { crud, interpoler, structure, syllabus } from './aide/i18n';

/**
 * La création d'une promotion par gabarit (16 septembre 2026) : le formulaire
 * de création porte un sélecteur « Créer à partir de la promotion… », et le
 * serveur copie en une transaction la structure (options, périodes, UE,
 * matières) et le contenu syllabus (fiches, référentiel, matrices) de la
 * promotion choisie. Sans gabarit, la promotion naît vide, comme avant.
 *
 * Chaque test crée sa promotion sous « E2E Formation », la vérifie, puis la
 * met en corbeille : le nom d'une promotion est unique parmi les actives, et
 * la purge du seed (par la formation, CASCADE) emporte la corbeille au run
 * suivant. Les promotions créées ne portent pas le préfixe d'un nom du seed.
 */

const COPIEE = 'E2E Promo Copiee';
const VIDE = 'E2E Promo Neuve';
const CREER_PROMOTION = interpoler(crud.creationInvite_f, { nom: crud.entites.promotion.nom });
const MATRICE = syllabus.competences.matrice;

/**
 * La liste des promotions de « E2E Formation » : l'arbre dépose sur le
 * détail de la formation, le menu de son bandeau mène à la liste. Toute la
 * suite navigue par les menus d'actions des lignes, jamais par l'arbre —
 * un nœud ajouté en cours de test se clique mal pendant le dépliage. Et
 * chaque nouvelle descente se fait sur une PAGE NEUVE du même contexte : la
 * mémoire de navigation d'une page déjà descendue fait rebondir l'arbre
 * (précédent : matrice-competences.spec.ts).
 */
async function allerALaListeDesPromotions(page: Page): Promise<void> {
    await allerSurFormationViaStructure(page);
    // Le bandeau promeut la première action en bouton direct : sous
    // CONSULTATION « Gérer les promotions » est la seule, il n'y a pas de
    // menu ; sous un rôle d'écriture elle reste dans le menu, derrière
    // « Éditer ». L'un ou l'autre.
    const boutonDirect = page.getByRole('button', { name: crud.entites.actions.gererPromotions, exact: true });
    const boutonMenu = boutonLigne(page, E2E.formation);
    await boutonDirect.or(boutonMenu).first().waitFor();
    if (await boutonDirect.count() > 0) {
        await boutonDirect.click();
    } else {
        await boutonMenu.click();
        await page.getByRole('menuitem', { name: crud.entites.actions.gererPromotions }).click();
    }
    await page.waitForURL(/\/promotion$/);
    await expect(page.getByRole('cell', { name: E2E.promotion, exact: true })).toBeVisible();
}

/** Le bouton du menu d'une ligne, en nom exact : « E2E Option » est le préfixe de deux autres options. */
function boutonLigne(page: Page, nomLigne: string) {
    return page.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: nomLigne }), exact: true });
}

/** Ouvre l'action nommée du menu de la ligne, et attend l'URL qui en résulte. */
async function suivreAction(page: Page, ligne: string, action: string, url: RegExp): Promise<void> {
    await boutonLigne(page, ligne).click();
    await page.getByRole('menuitem', { name: action }).click();
    await page.waitForURL(url);
}

/** Remplit le formulaire de création d'une promotion ; le gabarit est choisi par son nom, ou laissé vide. */
async function creerPromotion(page: Page, nom: string, gabarit: string | null): Promise<void> {
    await allerALaListeDesPromotions(page);
    await page.getByRole('button', { name: CREER_PROMOTION }).first().click();
    await expect(page.getByRole('heading', { name: crud.form.titreAjouter })).toBeVisible();

    await page.getByLabel(structure.promotion.champTitre).fill(nom);
    const champGabarit = page.getByRole('combobox', { name: structure.promotion.champGabarit });
    await expect(champGabarit).toBeVisible();
    if (gabarit !== null) {
        await champGabarit.click();
        await page.getByRole('option', { name: gabarit, exact: true }).click();
    }
    await page.getByLabel(structure.commun.dateDebut).fill('01/09/2027');
    await page.getByLabel(structure.commun.dateFin).fill('31/08/2028');
    await page.getByLabel(structure.promotion.champEchelleGpa).fill('a=4,b=3.5,c=3,d=2.5,e=2,f=0');
    await page.getByLabel(structure.promotion.champEchelle, { exact: true }).fill('a=16,b=14,c=12,d=10,e=8');
    await page.getByRole('button', { name: crud.form.ajouter }).click();
    await expect(page.getByRole('cell', { name: nom, exact: true })).toBeVisible();
}

/** Met la promotion en corbeille depuis sa ligne de la liste, saisie de confirmation comprise. */
async function supprimerPromotion(page: Page, nom: string): Promise<void> {
    await allerALaListeDesPromotions(page);
    await page.getByRole('row', { name: nom }).getByRole('checkbox', { name: crud.table.selectionnerLigne }).check();
    await page.getByRole('button', { name: crud.actions.supprimerSelection }).click();
    const dialogue = page.getByRole('dialog', {
        name: interpoler(crud.deleteDialog.titreUn, { libelle: `${crud.entites.promotion.nomAvecArticle} `, nom }),
    });
    await expect(dialogue).toBeVisible();
    await dialogue.getByLabel(crud.deleteDialog.confirmationLabel).fill(nom);
    await dialogue.getByRole('button', { name: crud.deleteDialog.supprimer }).click();
    await expect(dialogue).toHaveCount(0);
    await expect(page.getByRole('cell', { name: nom, exact: true })).toHaveCount(0);
}

test.describe('Création d\'une promotion par gabarit', () => {
    test('avec gabarit : structure, référentiel et matrice de « E2E Promotion » copiés, la source intacte', async ({ pageAdmin }) => {
        await creerPromotion(pageAdmin, COPIEE, E2E.promotion);

        // Le référentiel : les deux blocs semés, mêmes ordres, pas celui de
        // l'autre promotion.
        await suivreAction(pageAdmin, COPIEE, syllabus.competences.action, /\/promotion\/\d+\/bloc$/);
        await expect(pageAdmin.getByRole('cell', { name: E2E.bloc1, exact: true })).toBeVisible();
        await expect(pageAdmin.getByRole('cell', { name: E2E.bloc2, exact: true })).toBeVisible();
        await expect(pageAdmin.getByRole('cell', { name: 'E2E Bloc Etranger', exact: true })).toHaveCount(0);

        // La structure, par les menus de ligne : option → période → UE.
        const copie = await pageAdmin.context().newPage();
        await allerALaListeDesPromotions(copie);
        await suivreAction(copie, COPIEE, crud.entites.actions.gererOptions, /\/promotion\/\d+\/option$/);
        await expect(copie.getByRole('cell', { name: E2E.option, exact: true })).toBeVisible();
        await suivreAction(copie, E2E.option, crud.entites.actions.gererPeriodes, /\/option\/\d+\/periode$/);
        await suivreAction(copie, E2E.periode, crud.entites.actions.gererUe, /\/periode\/\d+\/ue$/);
        await suivreAction(copie, E2E.ue, syllabus.action, /\/ue\/\d+\/syllabus$/);

        // La matrice de l'UE copiée : la liaison semée (C1 enseignée + évaluée)
        // est reconduite, et se lit sur le référentiel de la copie. Le
        // responsable de l'UE suit (décision 4 : copié).
        await expect(copie.getByRole('heading', { name: MATRICE.titre })).toBeVisible();
        const caseEnseignee = copie.getByRole('checkbox', {
            name: interpoler(MATRICE.case, { axe: MATRICE.enseignee, code: 'C1', action: E2E.competence11 }), exact: true,
        });
        await expect(caseEnseignee).toBeChecked();
        await expect(copie.getByLabel(syllabus.responsable.rechercher)).toHaveValue(E2E.agent1);

        // Indépendance : décocher sur la copie ne touche pas la source.
        await caseEnseignee.uncheck();
        await copie.getByRole('button', { name: MATRICE.enregistrer }).click();
        await expect(copie.getByText(MATRICE.enregistre)).toBeVisible();
        await copie.close();
        const source = await pageAdmin.context().newPage();
        await allerAuSyllabusViaStructure(source, 'ue');
        await expect(source.getByRole('checkbox', {
            name: interpoler(MATRICE.case, { axe: MATRICE.enseignee, code: 'C1', action: E2E.competence11 }), exact: true,
        })).toBeChecked();
        await source.close();

        const fin = await pageAdmin.context().newPage();
        await supprimerPromotion(fin, COPIEE);
        await fin.close();
    });

    test('sans gabarit : la promotion naît vide', async ({ pageAdmin }) => {
        await creerPromotion(pageAdmin, VIDE, null);

        await suivreAction(pageAdmin, VIDE, crud.entites.actions.gererOptions, /\/promotion\/\d+\/option$/);
        await expect(pageAdmin.getByRole('cell', { name: E2E.option, exact: true })).toHaveCount(0);
        const referentiel = await pageAdmin.context().newPage();
        await allerALaListeDesPromotions(referentiel);
        await suivreAction(referentiel, VIDE, syllabus.competences.action, /\/promotion\/\d+\/bloc$/);
        await expect(referentiel.getByRole('cell', { name: E2E.bloc1, exact: true })).toHaveCount(0);
        await referentiel.close();

        const fin = await pageAdmin.context().newPage();
        await supprimerPromotion(fin, VIDE);
        await fin.close();
    });

    test('CONSULTATION : ni création, ni gabarit', async ({ pageConsultation }) => {
        await allerALaListeDesPromotions(pageConsultation);
        await expect(pageConsultation.getByRole('button', { name: CREER_PROMOTION })).toHaveCount(0);
    });
});
