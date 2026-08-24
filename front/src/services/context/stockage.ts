/**
 * Mémoire de navigation, en une seule clé de session.
 *
 * Elle remplace les sept clés `*_last_path` d'origine et porte trois choses :
 * le contexte hiérarchique partagé, le dernier chemin visité dans chaque
 * workflow, et lequel de ces workflows a été visité en dernier. Le contexte
 * n'est jamais une source de vérité — il est écrit depuis l'URL et ne sert
 * qu'à prolonger celle-ci vers le bas quand elle est moins profonde.
 */

import { NIVEAUX, type ContexteHierarchique } from './niveaux';
import { memeContexte } from './navigation';

export const CLE_NAVIGATION = 'scolarite_navigation';

/** Les clés d'avant l'unification, purgées au premier montage. */
const ANCIENNES_CLES = [
    'catalog_last_path',
    'note_last_path',
    'jury_last_path',
    'programme_last_path',
    'certification_last_path',
    'salle_last_path',
    'user_last_path',
    // Clés du mode édition, supprimé au profit d'actions conditionnées aux
    // rôles. L'espace final des clés `*_crud_edit_mode ` vient du code
    // d'origine : c'est bien ainsi qu'elles ont été écrites en session.
    'catalog_context_crud_edit_mode ',
    'note_workflow_crud_edit_mode ',
    'jury_workflow_crud_edit_mode ',
    'programme_context_crud_edit_mode ',
    'certification_workflow_crud_edit_mode ',
    'salle_workflow_crud_edit_mode ',
    'user_workflow_crud_edit_mode ',
    'planning_edit_mode',
];

export interface EtatNavigation {
    readonly contexte: ContexteHierarchique;
    /** Dernier chemin visité, indexé par identifiant de workflow. */
    readonly chemins: Readonly<Record<string, string>>;
    /**
     * Identifiant du dernier workflow de la barre de tâches où l'on a
     * travaillé. `chemins` dit où l'on en était dans chacun, mais pas lequel
     * on avait sous les yeux : c'est ce que l'entrée « Scolarité » du menu
     * latéral demande pour ramener au bon workflow. `undefined` tant qu'aucun
     * n'a été visité — session neuve.
     */
    readonly dernierWorkflow: string | undefined;
}

export const ETAT_NAVIGATION_VIDE: EtatNavigation = {
    contexte: {}, chemins: {}, dernierWorkflow: undefined,
};

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
    return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

function lireContexte(valeur: unknown): ContexteHierarchique {
    if (!estObjet(valeur)) return {};
    const contexte: ContexteHierarchique = {};
    for (const niveau of NIVEAUX) {
        const identifiant = valeur[niveau];
        if (typeof identifiant === 'string') contexte[niveau] = identifiant;
    }
    return contexte;
}

function lireChemins(valeur: unknown): Record<string, string> {
    if (!estObjet(valeur)) return {};
    const chemins: Record<string, string> = {};
    for (const [cle, chemin] of Object.entries(valeur)) {
        if (typeof chemin === 'string') chemins[cle] = chemin;
    }
    return chemins;
}

export function lireEtatNavigation(): EtatNavigation {
    try {
        const brut = sessionStorage.getItem(CLE_NAVIGATION);
        if (brut === null) return ETAT_NAVIGATION_VIDE;

        const analyse: unknown = JSON.parse(brut);
        if (!estObjet(analyse)) return ETAT_NAVIGATION_VIDE;

        const dernier = analyse.dernierWorkflow;

        return {
            contexte: lireContexte(analyse.contexte),
            chemins: lireChemins(analyse.chemins),
            dernierWorkflow: typeof dernier === 'string' ? dernier : undefined,
        };
    } catch {
        // Session illisible ou stockage indisponible : on repart d'un contexte vide.
        return ETAT_NAVIGATION_VIDE;
    }
}

export function ecrireEtatNavigation(etat: EtatNavigation): void {
    try {
        sessionStorage.setItem(CLE_NAVIGATION, JSON.stringify(etat));
    } catch {
        // Stockage indisponible : la navigation reste fonctionnelle, sans mémoire.
    }
}

function purgerAnciennesCles(): void {
    try {
        for (const cle of ANCIENNES_CLES) sessionStorage.removeItem(cle);
    } catch {
        // Rien à purger si le stockage est indisponible.
    }
}


// ─── Magasin externe ──────────────────────────────────────────────────────────
//
// La mémoire de navigation n'est pas un état de rendu : c'est un miroir de
// l'URL rangé dans le stockage de session. La tenir comme un magasin externe,
// consommé par `useSyncExternalStore`, met la synchronisation là où elle doit
// être — un effet qui pousse l'état de React vers un système extérieur — au
// lieu d'un `setState` dans un effet, qui provoquerait des rendus en cascade.

let etatCourant: EtatNavigation = (() => {
    purgerAnciennesCles();
    return lireEtatNavigation();
})();

const abonnes = new Set<() => void>();

function memesChemins(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
    const clesA = Object.keys(a);
    return clesA.length === Object.keys(b).length && clesA.every(cle => a[cle] === b[cle]);
}

export function etatNavigation(): EtatNavigation {
    return etatCourant;
}

export function sAbonnerNavigation(surChangement: () => void): () => void {
    abonnes.add(surChangement);
    return () => { abonnes.delete(surChangement); };
}

/** Sans changement, on ne notifie pas : c'est ce qui arrête la boucle de synchronisation. */
export function majEtatNavigation(suivant: EtatNavigation): void {
    if (memeContexte(etatCourant.contexte, suivant.contexte)
        && memesChemins(etatCourant.chemins, suivant.chemins)
        && etatCourant.dernierWorkflow === suivant.dernierWorkflow) {
        return;
    }

    etatCourant = suivant;
    ecrireEtatNavigation(suivant);
    for (const surChangement of abonnes) surChangement();
}
