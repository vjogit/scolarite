/**
 * Les chaînons d'un chemin hiérarchique, et sa reconstruction.
 *
 * Toute URL de la hiérarchie s'écrit `préfixe/segment/id/segment/id/…`,
 * éventuellement close par un segment sans identifiant — la liste d'un niveau
 * enfant — et par un mode CRUD. Ce module fait la bijection entre cette écriture
 * et la suite de chaînons qu'elle porte.
 *
 * Ce n'est pas un doublon de `construireCheminWorkflow` : celle-ci s'arrête aux
 * quatre niveaux partagés et ajoute l'écran terminal du workflow, alors qu'un
 * nœud d'arbre descend jusqu'à la matière et vise son propre détail. Ce sont
 * deux questions différentes, et `extraireContexte` n'est qu'un cas particulier
 * de la lecture ci-dessous, restreint aux niveaux partagés.
 */

import type { CrudMode } from '../crud/def';

export interface Chainon {
    readonly segment: string;
    readonly identifiant: string;
}

export interface CheminAnalyse {
    /** Les paires `segment/identifiant`, du plus général au plus précis. */
    readonly chainons: readonly Chainon[];
    /**
     * Segment final dépourvu d'identifiant : la liste d'un niveau enfant, ou un
     * écran greffé. `null` quand le chemin s'arrête sur un chaînon complet.
     */
    readonly segmentTerminal: string | null;
    readonly mode: CrudMode;
}

/** Un segment d'URL est un identifiant s'il n'est fait que de chiffres. */
function estIdentifiant(segment: string): boolean {
    return /^\d+$/.test(segment);
}

const SEGMENT_CREATION = 'new';
const SEGMENT_EDITION = 'edit';

/**
 * Lit un chemin sous un préfixe de workflow. Un chemin étranger au préfixe
 * donne une analyse vide, jamais une exception : c'est ce qui arrive le temps
 * d'un rendu, entre deux navigations.
 */
export function analyserChemin(pathname: string, prefixe: string): CheminAnalyse {
    const segments = pathname.split('/').filter(Boolean);
    const debut = prefixe.split('/').filter(Boolean).length;

    const chainons: Chainon[] = [];
    let segmentTerminal: string | null = null;
    let mode: CrudMode = 'list';

    let i = debut;
    while (i < segments.length) {
        const segment = segments[i];

        if (segment === SEGMENT_CREATION) {
            mode = 'create';
            break;
        }
        if (segment === SEGMENT_EDITION) {
            mode = 'edit';
            break;
        }

        const suivant = i + 1 < segments.length ? segments[i + 1] : null;
        if (suivant !== null && estIdentifiant(suivant)) {
            chainons.push({ segment, identifiant: suivant });
            i += 2;
            continue;
        }

        // Segment sans identifiant : la liste d'un niveau, ou un écran greffé.
        segmentTerminal = segment;
        i += 1;
    }

    // `…/promotion/34` sans rien derrière est le détail de la promotion ; le
    // mode `list` ne vaut que pour un chemin qui s'arrête sur un segment nu.
    if (mode === 'list' && segmentTerminal === null && chainons.length > 0) {
        mode = 'show';
    }

    return { chainons, segmentTerminal, mode };
}

/** L'écriture inverse : le chemin que porte une suite de chaînons. */
export function construireChemin(prefixe: string, chainons: readonly Chainon[]): string {
    const suite = chainons
        .map(chainon => `/${chainon.segment}/${chainon.identifiant}`)
        .join('');
    return `/${prefixe}${suite}`;
}
