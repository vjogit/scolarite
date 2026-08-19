/**
 * Le contrat du contexte hiérarchique, séparé de son fournisseur.
 *
 * Deux lectures cohabitent, et la distinction est le cœur du dispositif :
 *
 * - `parUrl` est dérivé du seul `pathname`. C'est ce qui s'affiche. Un
 *   rechargement ou un lien collé dans un onglet neuf redonne exactement le
 *   même contexte, puisque rien d'autre ne l'alimente.
 * - `pourNavigation` prolonge `parUrl` par la mémoire de session pour
 *   construire les cibles de bascule. Il n'est jamais affiché, donc il ne peut
 *   pas donner à voir un état qui diverge de l'URL.
 */

import { createContext, use } from 'react';

import type { ContexteHierarchique, Niveau } from './niveaux';
import type { DescripteurWorkflow } from './workflows';

export interface NiveauResolu {
    readonly identifiant: string;
    /** `null` tant que le nom n'est pas connu : on n'affiche jamais `#12`. */
    readonly nom: string | null;
    readonly enChargement: boolean;
}

export interface ValeurContexteHierarchie {
    /** Dérivé du pathname : la vérité affichable. */
    readonly parUrl: Partial<Record<Niveau, NiveauResolu>>;
    /** Complété par la mémoire de session : sert à construire les cibles. */
    readonly pourNavigation: ContexteHierarchique;
    readonly workflowCourant: DescripteurWorkflow | null;
    /** Dernier chemin visité par workflow. */
    readonly chemins: Readonly<Record<string, string | undefined>>;
}

export const ContexteHierarchie = createContext<ValeurContexteHierarchie | null>(null);

export function useContexteHierarchie(): ValeurContexteHierarchie {
    const valeur = use(ContexteHierarchie);
    if (valeur === null) {
        throw new Error("useContexteHierarchie doit être utilisé sous ContexteHierarchieProvider");
    }
    return valeur;
}
