/**
 * Construction et lecture des chemins de la hiérarchie partagée.
 *
 * Tout est pur et hors composant : ces fonctions ne connaissent ni React, ni
 * le routeur, ni le stockage de session. C'est la brique que réutilisera
 * l'aplatissement des routes.
 */

import type { DescripteurWorkflow } from './workflows';
import { NIVEAUX, estNiveau, type ContexteHierarchique, type Niveau } from './niveaux';

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

    // On lit les paires deux à deux : `segments.slice(1)` donne le suivant de
    // chaque segment, ce qui évite d'indexer et de border la boucle à la main.
    segments.forEach((segment, rang) => {
        const suivant = segments[rang + 1];
        if (suivant !== undefined && estNiveau(segment) && estIdentifiant(suivant)) {
            contexte[segment] = suivant;
        }
    });

    return contexte;
}

/** Profondeur du préfixe de niveaux consécutifs réellement renseignés. */
function profondeur(contexte: ContexteHierarchique): number {
    let n = 0;
    for (const niveau of NIVEAUX) {
        if (contexte[niveau] === undefined) break;
        n++;
    }
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
    for (const niveau of NIVEAUX.slice(0, profondeurUrl)) {
        fusion[niveau] = contexteUrl[niveau];
        if (contexteMemorise[niveau] !== contexteUrl[niveau]) memoireUtilisable = false;
    }

    if (!memoireUtilisable) return fusion;

    for (const niveau of NIVEAUX.slice(profondeurUrl)) {
        const memorise = contexteMemorise[niveau];
        if (memorise === undefined) break;
        fusion[niveau] = memorise;
    }

    return fusion;
}

/**
 * Le contexte obtenu en imposant une valeur à un niveau.
 *
 * Les niveaux au-dessus sont conservés, celui-ci prend la nouvelle valeur, et
 * tout ce qui est en dessous disparaît : ces identifiants décrivent une autre
 * branche de la hiérarchie. C'est le raisonnement que `fusionnerContexte`
 * applique déjà quand l'URL contredit la mémoire, exprimé ici pour lui seul —
 * une bascule de sélecteur n'a pas de mémoire à fusionner.
 */
export function remplacerNiveau(
    contexte: ContexteHierarchique,
    niveau: Niveau,
    identifiant: string,
): ContexteHierarchique {
    const remplace: ContexteHierarchique = {};

    for (const courant of NIVEAUX) {
        if (courant === niveau) {
            remplace[courant] = identifiant;
            break;
        }
        const valeur = contexte[courant];
        if (valeur === undefined) break;
        remplace[courant] = valeur;
    }

    return remplace;
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

    return [...segments].reverse().find(segment => ecransTerminaux.includes(segment));
}

function choisirEcranTerminal(
    ecransTerminaux: readonly string[],
    prefere: string | undefined,
): string | null {
    const [premier] = ecransTerminaux;
    if (premier === undefined) return null;
    if (prefere !== undefined && ecransTerminaux.includes(prefere)) return prefere;
    return premier;
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
    const [premierNiveau] = niveaux;
    if (premierNiveau === undefined) return `/${workflow.chemin}`;

    let chemin = `/${workflow.chemin}/${premierNiveau}`;

    for (const [rang, niveau] of niveaux.entries()) {
        const identifiant = contexte[niveau];
        if (identifiant === undefined) return chemin;

        const niveauSuivant = niveaux[rang + 1];
        if (niveauSuivant !== undefined) {
            chemin += `/${identifiant}/${niveauSuivant}`;
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
