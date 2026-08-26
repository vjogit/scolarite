import type { Locator, Page } from '@playwright/test';
import { app, crud, interpoler, libelleNiveau, note } from './i18n';

/**
 * Les noms de la branche dédiée posée par `e2e/setup/seed.sql` — jamais une
 * autre hiérarchie : voir la décision (d) (isolation vis-à-vis des données
 * vérifiées à la main, qu'un aller-retour Excel a déjà détruites une fois).
 */
export const E2E = {
    formation: 'E2E Formation',
    promotion: 'E2E Promotion',
    option: 'E2E Option',
    optionSacrificielle: 'E2E Option Sacrificielle',
    optionDeliberee: 'E2E Option Deliberee',
    periode: 'E2E Periode',
    periodeSacrificielle: 'E2E Periode Sacrificielle',
    ue: 'E2E UE1',
    matiere: 'E2E Matiere',
    controleContinu: 'E2E Controle Continu',
    controleRattrapage: 'E2E Controle Rattrapage',
    groupe: 'E2E Groupe',
    eleve1: 'Eleve1 E2E',
    eleve2: 'Eleve2 E2E',
    eleve3: 'Eleve3 E2E',
    eleve4: 'Eleve4 E2E',
} as const;

type Niveau = keyof typeof app.niveaux;

/** Attend que Keycloak ait fini son aller-retour avant de s'appuyer sur l'URL. */
export async function attendreChargementInitial(page: Page): Promise<void> {
    await page.waitForFunction(() => !location.href.includes('/auth/realms/'), null, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
}

/**
 * Choisit une valeur dans le sélecteur de niveau du fil de contexte. Si la
 * mémoire de session (`pourNavigation`) a déjà résolu ce niveau à la bonne
 * valeur — un test qui enchaîne plusieurs navigations internes en hérite —
 * ne clique rien : le bouton porte déjà le nom cherché.
 */
export async function choisirNiveau(page: Page, niveau: Niveau, valeur: string): Promise<void> {
    const boutonCible = page.getByRole('button', { name: libelleNiveau(niveau, valeur) });
    if (await boutonCible.count() > 0) return;
    await page.getByRole('button', { name: new RegExp(`^${app.niveaux[niveau]} :`) }).click();
    await page.getByRole('menuitem', { name: valeur, exact: true }).click();
    await boutonCible.waitFor();
}

/**
 * Descend jusqu'à la période E2E via le fil de contexte (menus « Choisir »),
 * dans les workflows qui l'utilisent — Notes, Jury, Programme.
 */
export async function allerJusquaPeriode(
    page: Page,
    onglet: 'notes' | 'jury' | 'programme',
    option: string = E2E.option,
    periode: string = E2E.periode,
): Promise<void> {
    await page.goto('/');
    await attendreChargementInitial(page);
    await page.getByRole('tab', { name: app.workflows[onglet] }).click();
    await page.waitForLoadState('networkidle');
    await choisirNiveau(page, 'formation', E2E.formation);
    await choisirNiveau(page, 'promotion', E2E.promotion);
    await choisirNiveau(page, 'option', option);
    await choisirNiveau(page, 'periode', periode);
}

/**
 * Descend jusqu'à la période E2E via l'arborescence du workflow Structure —
 * seul workflow qui navigue par arbre plutôt que par fil de contexte.
 */
export async function allerJusquaPeriodeViaStructure(
    page: Page,
    option: string = E2E.option,
    periode: string = E2E.periode,
): Promise<void> {
    await page.goto('/');
    await attendreChargementInitial(page);
    await page.getByRole('tab', { name: app.workflows.structure }).click();
    await page.waitForLoadState('networkidle');

    // Chaque clic déplie une branche de l'arbre (transition MUI) — voir
    // `cliquerPuisAttendreUrl` pour le défaut de rendu figé qu'il absorbe.
    const treeFormation = page.getByRole('treeitem', { name: `Formation ${E2E.formation}` });
    await cliquerPuisAttendreUrl(page, () => treeFormation.click(), /\/formation\/\d+$/);
    const treePromotion = page.getByRole('treeitem', { name: `Promotion ${E2E.promotion}` });
    await cliquerPuisAttendreUrl(page, () => treePromotion.click(), /\/promotion\/\d+$/);
    const treeOption = page.getByRole('treeitem', { name: `Option ${option}`, exact: true });
    await cliquerPuisAttendreUrl(page, () => treeOption.click(), /\/option\/\d+$/);
    const treePeriode = page.getByRole('treeitem', { name: `Période ${periode}` });
    await cliquerPuisAttendreUrl(page, () => treePeriode.click(), /\/periode\/\d+$/);
}

/**
 * Clique puis attend l'URL qui en résulte, avec un réessai borné — et,
 * quand `contenu` est fourni, attend aussi qu'il devienne visible.
 *
 * Défaut constaté sur `BarreAxes` (voir notes-unifie.spec.ts) : le clic sur
 * un bouton d'axe change parfois l'URL sans que l'écran ne suive — le
 * contenu reste celui de l'axe précédent alors que l'adresse porte déjà le
 * nouvel axe. Reproductible, pas une lenteur réseau (confirmé immobile
 * après attente). Le réessai reclique tant que le contenu attendu n'est pas
 * là, pour que les suites qui ne testent pas ce défaut précis n'en héritent
 * pas la fragilité.
 */
export async function cliquerPuisAttendreUrl(
    page: Page,
    cliquer: () => Promise<void>,
    motif: RegExp,
    contenu?: Locator,
): Promise<void> {
    const TENTATIVES = 3;
    for (let tentative = 1; tentative <= TENTATIVES; tentative += 1) {
        await cliquer();
        try {
            await page.waitForURL(motif, { timeout: 4_000 });
            if (contenu) await contenu.waitFor({ timeout: 4_000 });
            return;
        } catch {
            // Se rattrape ci-dessous, par un remontage plutôt qu'un reclic.
        }
    }

    // Dernier recours, répété : l'URL peut déjà être correcte alors que
    // l'écran est resté figé sur l'axe précédent (reclique inutile dans ce
    // cas précis — voir remonterDepuisUrlActuelle). Si même ça échoue à
    // chaque essai, l'appelant a un vrai problème.
    const REMONTAGES = 3;
    for (let essai = 1; essai <= REMONTAGES; essai += 1) {
        await remonterDepuisUrlActuelle(page);
        try {
            if (contenu) await contenu.waitFor({ timeout: 10_000 });
            else if (!motif.test(page.url())) throw new Error(`URL toujours hors motif après remontage : ${page.url()}`);
            return;
        } catch (erreur) {
            if (essai === REMONTAGES) throw erreur;
        }
    }
}

/**
 * Force un remontage du contenu sur l'URL courante, sans repasser par
 * Keycloak. Défaut constaté sur `BarreAxes` (voir notes-unifie.spec.ts) :
 * l'URL change bien au clic sur un bouton d'axe, mais l'écran reste parfois
 * figé sur le contenu de l'axe précédent — recliquer le même bouton n'y
 * change rien, seul un remontage force le bon rendu. Contournement ciblé,
 * pas une correction : le défaut est signalé séparément (voir le
 * compte-rendu de vérification), ce module ne fait que ne pas en hériter
 * partout ailleurs.
 */
async function remonterDepuisUrlActuelle(page: Page): Promise<void> {
    const url = page.url();
    await page.evaluate(() => {
        history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // '/' passe par RetourScolarite : attendre que la reprise de tâche se
    // soit produite avant de repartir, sinon le retour vers `url` la coupe
    // en plein élan.
    await page.getByRole('tab', { selected: true }).waitFor();
    await page.evaluate((cible) => {
        history.pushState({}, '', cible);
        window.dispatchEvent(new PopStateEvent('popstate'));
    }, url);
}

/** Bascule vers un axe de `BarreAxes` — voir `cliquerPuisAttendreUrl`. */
export async function cliquerAxe(page: Page, libelle: string, motif: RegExp, contenu?: Locator): Promise<void> {
    await cliquerPuisAttendreUrl(
        page,
        () => page.getByRole('group', { name: note.barreAxes.axe }).getByRole('button', { name: libelle }).click(),
        motif,
        contenu,
    );
}

/** Bascule vers l'axe Élève et attend son sélecteur — voir `cliquerPuisAttendreUrl`. */
export async function allerAAxeEleve(page: Page): Promise<void> {
    await cliquerAxe(page, 'Élève', /\/eleve$/, page.getByRole('combobox', { name: 'Élève de la période' }));
}

/**
 * Depuis la période (workflow Notes), descend jusqu'à la grille de saisie
 * éditable. Chaque étape attend l'URL qui en résulte, pas seulement
 * l'absence de requête réseau : la ligne visée par le clic suivant peut
 * exister dans le DOM avant que la précédente navigation soit stabilisée.
 */
export async function allerALaGrilleDeSaisie(
    page: Page,
    groupe: string = E2E.groupe,
    controle: string = E2E.controleContinu,
    option: string = E2E.option,
    periode: string = E2E.periode,
    ue: string = E2E.ue,
    matiere: string = E2E.matiere,
): Promise<void> {
    await allerJusquaPeriode(page, 'notes', option, periode);

    const axe = page.getByRole('group', { name: note.barreAxes.axe });
    const ligneUe = page.getByRole('row', { name: ue }).getByRole('button', { name: note.routes.gererLesNotes });
    await cliquerPuisAttendreUrl(page, () => axe.getByRole('button', { name: 'UE' }).click(), /\/ue$/, ligneUe);
    await ligneUe.click();
    await page.waitForURL(/\/ue\/\d+\/note$/);
    await page.waitForLoadState('networkidle');

    const ligneMatiere = page.getByRole('row', { name: matiere }).getByRole('button', { name: note.routes.gererLesNotes });
    await cliquerPuisAttendreUrl(page, () => axe.getByRole('button', { name: 'Matière' }).click(), /\/matiere$/, ligneMatiere);
    await ligneMatiere.click();
    await page.waitForURL(/\/matiere\/\d+\/note$/);
    await page.waitForLoadState('networkidle');

    const ligneControle = page.getByRole('row', { name: controle }).getByRole('button', { name: note.routes.gererLesNotes });
    await cliquerPuisAttendreUrl(page, () => axe.getByRole('button', { name: 'Contrôle' }).click(), /\/controle$/, ligneControle);
    await ligneControle.click();
    await page.waitForURL(/\/controle\/\d+\/note$/);
    await page.waitForLoadState('networkidle');

    await page.getByRole('combobox', { name: 'Groupe' }).click();
    await page.getByRole('option', { name: groupe, exact: true }).click();
    await page.getByRole('table', { name: 'Grille de saisie des notes' }).waitFor();
}

/** Sélectionne une option depuis l'arborescence Structure (formation → promotion → option). */
export async function allerSurOptionViaStructure(page: Page, option: string): Promise<void> {
    await page.goto('/');
    await attendreChargementInitial(page);
    await page.getByRole('tab', { name: app.workflows.structure }).click();
    await page.waitForLoadState('networkidle');
    const treeFormation = page.getByRole('treeitem', { name: `Formation ${E2E.formation}` });
    await cliquerPuisAttendreUrl(page, () => treeFormation.click(), /\/formation\/\d+$/);
    const treePromotion = page.getByRole('treeitem', { name: `Promotion ${E2E.promotion}` });
    await cliquerPuisAttendreUrl(page, () => treePromotion.click(), /\/promotion\/\d+$/);
    const treeOption = page.getByRole('treeitem', { name: `Option ${option}`, exact: true });
    await cliquerPuisAttendreUrl(
        page, () => treeOption.click(), /\/option\/\d+$/,
        page.getByRole('heading', { name: `Option — ${option}` }),
    );
}

/** Ouvre la corbeille depuis le menu latéral (lien interne, pas de rechargement). */
export async function allerALaCorbeille(page: Page): Promise<void> {
    await page.goto('/');
    await attendreChargementInitial(page);
    await page.getByRole('link', { name: app.nav.corbeille }).click();
    await page.getByText('Chargement de la corbeille').waitFor({ state: 'hidden' });
}

/**
 * La carte d'une opération de corbeille portant ce titre — un `<div>` qui
 * contient à la fois le titre et le bouton Purger (présent sur toute carte),
 * pour isoler le bon jeu de boutons Restaurer/Purger d'une carte donnée.
 */
export function carteCorbeille(page: Page, titre: string) {
    return page.locator('div')
        .filter({ has: page.getByRole('heading', { name: titre, exact: true }) })
        .filter({ has: page.getByRole('button', { name: 'Purger' }) })
        .last();
}

/** Le bouton qui ouvre le menu d'actions d'une ligne de liste CRUD — voir `MenuActionsLigne`. */
function boutonActionsLigne(page: Page, nomLigne: string): Locator {
    return page.getByRole('button', { name: interpoler(crud.actions.menuLigne, { nom: nomLigne }) });
}

/**
 * Descend jusqu'à la liste des promotions de la formation E2E, via le
 * workflow Certifications — le seul qui s'arrête à la promotion (pas de
 * période : TOEIC et Mobilité internationale se greffent directement
 * dessous, voir certification/routes.tsx).
 *
 * S'arrête volontairement à la sélection de la FORMATION : sélectionner
 * aussi la promotion via le fil de contexte fait naviguer plus loin, vers le
 * premier écran terminal du workflow (TOEIC) — sautant la liste des
 * promotions et le menu d'actions de sa ligne, que les appelants de cette
 * fonction veulent justement atteindre.
 */
export async function allerJusquaPromotionCertification(page: Page): Promise<void> {
    await page.goto('/');
    await attendreChargementInitial(page);
    await page.getByRole('tab', { name: app.workflows.certifications }).click();
    await page.waitForLoadState('networkidle');
    await choisirNiveau(page, 'formation', E2E.formation);
}

/** Ouvre l'écran TOEIC de la promotion E2E, depuis le menu d'actions de sa ligne. */
export async function allerAuTOEIC(page: Page): Promise<void> {
    await allerJusquaPromotionCertification(page);
    await boutonActionsLigne(page, E2E.promotion).click();
    await page.getByRole('menuitem', { name: 'TOEIC' }).click();
    await page.waitForLoadState('networkidle');
}

/**
 * Ouvre le planning de la période E2E — seul écran terminal du workflow
 * Programme au niveau période (programme/routes.tsx, la seule greffe :
 * `Planning`). Sélectionner la période jusqu'au bout via le fil de contexte
 * y navigue directement (`WorkflowIndex` préfère l'unique écran terminal
 * quand rien n'est mémorisé) : pas de clic d'action de ligne à faire ici,
 * contrairement à Certifications (`allerAuTOEIC`), qui expose deux écrans
 * terminaux et doit donc choisir entre eux par un clic.
 */
export async function allerAuPlanning(page: Page): Promise<void> {
    await allerJusquaPeriode(page, 'programme');
}
