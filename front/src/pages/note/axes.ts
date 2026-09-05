/**
 * L'axe d'un écran de notes : sa lecture dans l'URL, et sa bascule.
 *
 * Rien n'est inventé ici. Les quatre greffes existantes *étaient* déjà des axes
 * dans l'URL — l'axe d'un écran de notes est le segment qui porte le dernier
 * identifiant avant `note` :
 *
 *     …/periode/2/note                            → Période
 *     …/periode/2/ue/1/note                       → UE
 *     …/periode/2/ue/1/matiere/1/note             → Matière
 *     …/periode/2/ue/1/matiere/1/controle/1/note  → Contrôle
 *     …/periode/2/eleve/42/note                   → Élève   (le cinquième)
 *
 * `chainons.ts` fait déjà la bijection entre cette écriture et la suite de
 * chaînons qu'elle porte : `analyserChemin` la lit, `construireChemin`
 * l'écrit. Ce module n'ajoute que la question propre aux notes — quel chaînon
 * est l'axe — et sa réponse inverse : quel chemin mène à tel axe.
 *
 * `remplacerNiveau` de `navigation.ts` ne pouvait pas servir : il n'itère que
 * sur `NIVEAUX`, les quatre niveaux partagés, et `ues`, `matiere`, `controle`,
 * `eleve` lui sont invisibles. Il reste l'outil des sélecteurs du fil ; il
 * n'est pas celui de la bascule d'axe.
 */

import i18n from '../../i18n/config';
import { analyserChemin, construireChemin, type Chainon } from '../../services/context/chainons';
import { WORKFLOW_NOTE } from '../../services/context/workflows';
import { FORMATION, MATIERE, OPTION, PERIODE, PROMOTION, UES } from '../structure/def';
import { CONTROLE, ELEVE, NOTE } from './def';

/** Préfixe de route du workflow, tel que `chainons.ts` l'attend. */
const PREFIXE = WORKFLOW_NOTE.chemin;

/**
 * Lié au namespace `note`, langue active suivie à chaque appel. Les axes sont
 * des constantes de module : une chaîne résolue ici figerait la langue de
 * démarrage, d'où des fermetures résolues au rendu — le parti des
 * `actionsLigne` des `routes.tsx`.
 */
const traduire = i18n.getFixedT(null, 'note');

/**
 * Ce que l'axe donne à voir. `saisie` est le seul à porter une route
 * d'écriture ; les autres n'en ont aucune côté serveur.
 */
export type NatureAxe = 'saisie' | 'calcule' | 'releve';

export interface Axe {
    /** Segment porteur dans l'URL : c'est lui qui identifie l'axe. */
    readonly segment: string;
    /** Résolu au rendu, dans la langue active — jamais au chargement du module. */
    readonly libelle: () => string;
    readonly nature: NatureAxe;
    /** Ce que l'écran annonce de lui-même, sous son titre. Résolu au rendu aussi. */
    readonly annonce: () => string;
}

export const AXE_ELEVE: Axe = {
    segment: ELEVE,
    libelle: () => traduire('axes.eleve.libelle'),
    nature: 'releve',
    annonce: () => traduire('axes.eleve.annonce'),
};

export const AXE_CONTROLE: Axe = {
    segment: CONTROLE,
    libelle: () => traduire('axes.controle.libelle'),
    nature: 'saisie',
    annonce: () => traduire('axes.controle.annonce'),
};

export const AXE_MATIERE: Axe = {
    segment: MATIERE,
    libelle: () => traduire('axes.matiere.libelle'),
    nature: 'calcule',
    annonce: () => traduire('axes.matiere.annonce'),
};

export const AXE_UE: Axe = {
    segment: UES,
    libelle: () => traduire('axes.ue.libelle'),
    nature: 'calcule',
    annonce: () => traduire('axes.ue.annonce'),
};

export const AXE_PERIODE: Axe = {
    segment: PERIODE,
    libelle: () => traduire('axes.periode.libelle'),
    nature: 'calcule',
    annonce: () => traduire('axes.periode.annonce'),
};

/** Ordre du commutateur : du plus fin au plus large. */
export const AXES: readonly Axe[] = [AXE_ELEVE, AXE_CONTROLE, AXE_MATIERE, AXE_UE, AXE_PERIODE];

const PAR_SEGMENT = new Map(AXES.map(axe => [axe.segment, axe]));

/**
 * Le segment sous lequel chacun se greffe. Sert à la descente : quand l'axe
 * visé n'est pas dans l'URL, on remonte cette chaîne jusqu'au plus profond de
 * ses ancêtres connus.
 */
const PARENT: Readonly<Record<string, string>> = {
    [PROMOTION]: FORMATION,
    [OPTION]: PROMOTION,
    [PERIODE]: OPTION,
    [UES]: PERIODE,
    [MATIERE]: UES,
    [CONTROLE]: MATIERE,
    [ELEVE]: PERIODE,
};

/**
 * Les chaînons qui décrivent la position, le détail d'une note écarté.
 *
 * `…/controle/1/note/12/edit` porte un chaînon `note/12` : c'est le formulaire
 * d'une note, pas un niveau. L'axe reste celui du chaînon qui le porte.
 */
function chainonsUtiles(pathname: string): readonly Chainon[] {
    const { chainons } = analyserChemin(pathname, PREFIXE);
    return chainons.at(-1)?.segment === NOTE ? chainons.slice(0, -1) : chainons;
}

/**
 * L'axe que porte un chemin, ou `null` hors d'un écran de notes — la traversée
 * de la hiérarchie et les listes intermédiaires n'en ont pas.
 */
export function axeDuChemin(pathname: string): Axe | null {
    const { segmentTerminal } = analyserChemin(pathname, PREFIXE);

    // `…/periode/2/eleve` : l'axe est choisi, l'élève ne l'est pas encore.
    if (segmentTerminal === ELEVE) return AXE_ELEVE;
    if (segmentTerminal !== NOTE) return null;

    const porteur = chainonsUtiles(pathname).at(-1);
    return porteur === undefined ? null : PAR_SEGMENT.get(porteur.segment) ?? null;
}

/**
 * Le commutateur a-t-il lieu d'être ?
 *
 * Il faut une période : les cinq axes s'y rattachent, directement ou par un de
 * leurs ancêtres. Au-dessus — la traversée formation, promotion, option — il
 * n'y a pas encore d'axe à commuter.
 *
 * La condition est plus large qu'`axeDuChemin` à dessein : la bascule vers un
 * axe plus profond dépose sur une liste intermédiaire, où aucun axe n'est
 * encore actif. Le commutateur doit y rester, sans quoi il disparaîtrait
 * précisément là où l'utilisateur vient de s'en servir.
 */
export function axesDisponibles(pathname: string): boolean {
    return chainonsUtiles(pathname).some(chainon => chainon.segment === PERIODE);
}

/** La position de l'axe dans les chaînons, `-1` s'il n'y est pas. */
function rangAxe(utiles: readonly Chainon[], axe: Axe): number {
    return utiles.findIndex(chainon => chainon.segment === axe.segment);
}

/**
 * L'axe s'ouvre-t-il directement depuis la position courante ?
 *
 * C'est le premier des deux cas de `cheminVersAxe`, exposé pour que le
 * commutateur puisse l'annoncer : un axe dont l'identifiant manque à l'URL
 * dépose sur une liste où un choix reste à faire. Rien d'autre n'en découle —
 * l'axe reste actif et mène au même endroit, il demande un choix de plus.
 */
export function axeDirect(pathname: string, axe: Axe): boolean {
    return rangAxe(chainonsUtiles(pathname), axe) !== -1;
}

/**
 * Le chemin qui mène à un axe depuis la position courante.
 *
 * Deux cas, et un seul principe : on garde du chemin tout ce qui reste vrai.
 *
 * - L'axe visé est déjà dans l'URL — « matière » vers « UE », « n'importe »
 *   vers « période », ou l'élève déjà choisi : on tronque à ce chaînon et on
 *   rouvre l'écran de notes. Le parent est conservé, comme demandé.
 * - Il n'y est pas — « période » vers « matière » : on ne peut pas inventer
 *   l'identifiant. On descend jusqu'au plus profond de ses ancêtres connus et
 *   on s'arrête sur la liste du niveau suivant, où le choix se fait. C'est le
 *   parti déjà pris par le fil de contexte, et pour la même raison : rétablir
 *   un identifiant depuis une mémoire invisible donnerait une position que
 *   l'utilisateur n'a pas choisie.
 */
export function cheminVersAxe(pathname: string, axe: Axe): string {
    const utiles = chainonsUtiles(pathname);

    const rang = rangAxe(utiles, axe);
    if (rang !== -1) {
        return `${construireChemin(PREFIXE, utiles.slice(0, rang + 1))}/${NOTE}`;
    }

    // L'axe manque : on remonte sa lignée jusqu'à un ancêtre présent.
    let vise = axe.segment;
    for (;;) {
        const parent = PARENT[vise];
        if (parent === undefined) return `/${PREFIXE}/${FORMATION}`;

        const rangParent = utiles.findIndex(chainon => chainon.segment === parent);
        if (rangParent !== -1) {
            return `${construireChemin(PREFIXE, utiles.slice(0, rangParent + 1))}/${vise}`;
        }
        vise = parent;
    }
}

/**
 * Le chemin de l'axe Élève pour un élève donné, depuis la position courante.
 * Sert à la couture depuis la grille : la période du contexte est conservée,
 * tout ce qui la suivait — UE, matière, contrôle — décrit une autre branche.
 */
export function cheminVersEleve(pathname: string, userId: number): string | null {
    const utiles = chainonsUtiles(pathname);
    const rang = utiles.findIndex(chainon => chainon.segment === PERIODE);
    if (rang === -1) return null;

    const base = construireChemin(PREFIXE, utiles.slice(0, rang + 1));
    return `${base}/${ELEVE}/${String(userId)}/${NOTE}`;
}
