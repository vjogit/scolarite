/**
 * Construction et lecture des chemins de la hiérarchie partagée.
 *
 * Tout est pur et hors composant : ces fonctions ne connaissent ni React, ni
 * le routeur, ni le stockage de session. C'est la brique que réutilisera
 * l'aplatissement des routes.
 */

import type { DescripteurWorkflow } from './workflows';
import { NIVEAUX, estNiveau, type ContexteHierarchique } from './niveaux';

/** Un segment d'URL est un identifiant s'il n'est fait que de chiffres. */
function estIdentifiant(segment: string): boolean {
    return /^\d+$/.test(segment);
}

/**
 * Le contexte que porte un chemin.
 *
 * On repère les paires `niveau/identifiant` au lieu de compter les segments :
 * le préfixe de workflow n'a pas la même profondeur partout
 * (`/catalog_context/…` contre `/resultat/note_workflow/…`), et les segments
 * étrangers à la hiérarchie (`new`, `edit`, `groupe/4`, `ue/12`) sont ignorés
 * sans qu'on ait à les énumérer.
 */
export function extraireContexte(pathname: string): ContexteHierarchique {
    const segments = pathname.split('/').filter(Boolean);
    const contexte: ContexteHierarchique = {};

    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];
        const suivant = segments[i + 1];
        if (estNiveau(segment) && estIdentifiant(suivant)) {
            contexte[segment] = suivant;
        }
    }

    return contexte;
}

/** Profondeur du préfixe de niveaux consécutifs réellement renseignés. */
function profondeur(contexte: ContexteHierarchique): number {
    let n = 0;
    while (n < NIVEAUX.length && contexte[NIVEAUX[n]] !== undefined) n++;
    return n;
}

/**
 * Complète le contexte de l'URL par celui mémorisé — et lui seul fait foi en
 * cas de désaccord.
 *
 * La mémoire ne sert qu'à prolonger l'URL vers le bas : quitter un écran
 * profond pour une liste ne doit pas faire perdre la position. Mais dès qu'un
 * niveau de l'URL contredit la mémoire, tout ce qui est plus profond décrit
 * une autre branche de la hiérarchie et doit disparaître — sans quoi on
 * conserverait une période qui n'appartient pas à l'option affichée.
 */
export function fusionnerContexte(
    contexteUrl: ContexteHierarchique,
    contexteMemorise: ContexteHierarchique,
): ContexteHierarchique {
    const fusion: ContexteHierarchique = {};
    const profondeurUrl = profondeur(contexteUrl);

    // L'URL d'abord, intégralement : elle fait foi.
    let memoireUtilisable = true;
    for (let i = 0; i < profondeurUrl; i++) {
        const niveau = NIVEAUX[i];
        fusion[niveau] = contexteUrl[niveau];
        if (contexteMemorise[niveau] !== contexteUrl[niveau]) memoireUtilisable = false;
    }

    if (!memoireUtilisable) return fusion;

    for (let i = profondeurUrl; i < NIVEAUX.length; i++) {
        const niveau = NIVEAUX[i];
        const memorise = contexteMemorise[niveau];
        if (memorise === undefined) break;
        fusion[niveau] = memorise;
    }

    return fusion;
}

/**
 * L'écran terminal à privilégier, quand le workflow en propose plusieurs.
 * On relit le chemin mémorisé plutôt que de tenir un état de plus.
 */
export function ecranTerminalDuChemin(
    chemin: string | undefined,
    ecransTerminaux: readonly string[],
): string | undefined {
    if (chemin === undefined || ecransTerminaux.length < 2) return undefined;
    const segments = chemin.split('/').filter(Boolean);

    for (let i = segments.length - 1; i >= 0; i--) {
        if (ecransTerminaux.includes(segments[i])) return segments[i];
    }
    return undefined;
}

function choisirEcranTerminal(
    ecransTerminaux: readonly string[],
    prefere: string | undefined,
): string | null {
    if (ecransTerminaux.length === 0) return null;
    if (prefere !== undefined && ecransTerminaux.includes(prefere)) return prefere;
    return ecransTerminaux[0];
}

/**
 * Le chemin d'entrée d'un workflow pour un contexte donné.
 *
 * On descend tant que le workflow et le contexte le permettent : dès qu'un
 * identifiant manque on s'arrête sur la liste de ce niveau, et l'utilisateur
 * poursuit la sélection là où elle s'interrompt. Quand tous les niveaux
 * supportés sont connus, on ouvre l'écran terminal du workflow ; s'il n'y en a
 * pas, on retombe sur la liste du dernier niveau.
 */
export function construireCheminWorkflow(
    workflow: DescripteurWorkflow,
    contexte: ContexteHierarchique,
    ecranTerminalPrefere?: string,
): string {
    const { niveaux, ecransTerminaux } = workflow;
    if (niveaux.length === 0) return `/${workflow.chemin}`;

    let chemin = `/${workflow.chemin}/${niveaux[0]}`;

    for (let i = 0; i < niveaux.length; i++) {
        const identifiant = contexte[niveaux[i]];
        if (identifiant === undefined) return chemin;

        if (i + 1 < niveaux.length) {
            chemin += `/${identifiant}/${niveaux[i + 1]}`;
            continue;
        }

        const terminal = choisirEcranTerminal(ecransTerminaux, ecranTerminalPrefere);
        return terminal === null ? chemin : `${chemin}/${identifiant}/${terminal}`;
    }

    return chemin;
}

/**
 * Un chemin mémorisé reste utilisable tant qu'aucun de ses identifiants ne
 * contredit le contexte courant. Sinon il ramènerait sur la période d'une
 * autre promotion, et il vaut mieux reconstruire.
 */
export function estCheminCompatible(chemin: string, contexte: ContexteHierarchique): boolean {
    const contexteDuChemin = extraireContexte(chemin);
    return NIVEAUX.every(niveau => {
        const valeur = contexteDuChemin[niveau];
        return valeur === undefined || valeur === contexte[niveau];
    });
}

export function memeContexte(a: ContexteHierarchique, b: ContexteHierarchique): boolean {
    return NIVEAUX.every(niveau => a[niveau] === b[niveau]);
}
