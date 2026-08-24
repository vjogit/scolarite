import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router';

import { ENDPOINT_PAR_NIVEAU, NIVEAUX, type ContexteHierarchique, type EntiteNommee, type Niveau } from './niveaux';
import { FORMATION, OPTION, PERIODE, PROMOTION } from '../../pages/structure/def';
import { extraireContexte, fusionnerContexte } from './navigation';
import { trouverWorkflow, WORKFLOWS_HIERARCHIQUES } from './workflows';
import { etatNavigation, majEtatNavigation, sAbonnerNavigation, type EtatNavigation } from './stockage';
import { ContexteHierarchie, type NiveauResolu, type ValeurContexteHierarchie } from './contexte';
import { depotFreres } from './freres';
import { useNomResolu } from './resolution';

const projeterNom = (donnee: unknown): string | null => {
    const nom = (donnee as EntiteNommee).name;
    return typeof nom === 'string' && nom.length > 0 ? nom : null;
};

/**
 * Résout le nom d'un niveau.
 *
 * La clé `[niveau, identifiant]` est celle de toutes les résolutions de nom :
 * TanStack Query dédoublonne, et le contexte n'ajoute aucun appel réseau à un
 * écran qui résout déjà ce niveau. Le dépôt du niveau sert de secours le temps
 * de la première réponse : les noms sont déjà dans la liste traversée.
 */
function useNiveauResolu(
    niveau: Niveau,
    identifiant: string | undefined,
    contexteUrl: ContexteHierarchique,
): NiveauResolu | undefined {
    const depotParent = useMemo(() => depotFreres(niveau, contexteUrl), [niveau, contexteUrl]);
    return useNomResolu({
        cle: [niveau, identifiant],
        endpoint: ENDPOINT_PAR_NIVEAU[niveau],
        identifiant,
        projeter: projeterNom,
        depotParent,
    });
}

export function ContexteHierarchieProvider({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();

    const contexteUrl = useMemo(() => extraireContexte(pathname), [pathname]);
    const workflowCourant = useMemo(() => trouverWorkflow(pathname), [pathname]);

    const memoire = useSyncExternalStore(sAbonnerNavigation, etatNavigation);

    const pourNavigation = useMemo(
        () => fusionnerContexte(contexteUrl, memoire.contexte),
        [contexteUrl, memoire],
    );

    // Le dernier workflow retenu est celui de la barre de tâches, et lui seul :
    // Salles et Utilisateurs sont des workflows au sens du descripteur, mais ce
    // sont des destinations globales. Les compter ici ferait revenir « Scolarité »
    // sur les salles qu'on vient de quitter, au lieu de la tâche en cours.
    const dernierWorkflow = workflowCourant !== null && WORKFLOWS_HIERARCHIQUES.includes(workflowCourant)
        ? workflowCourant.id
        : memoire.dernierWorkflow;

    // Synchronisation vers le magasin : la mémoire suit l'URL, jamais l'inverse.
    useEffect(() => {
        const chemins = { ...memoire.chemins };
        // La racine d'un workflow est une redirection, pas une position.
        if (workflowCourant !== null && pathname !== `/${workflowCourant.chemin}`) {
            chemins[workflowCourant.id] = pathname;
        }

        const suivant: EtatNavigation = { contexte: pourNavigation, chemins, dernierWorkflow };
        majEtatNavigation(suivant);
    }, [pathname, workflowCourant, pourNavigation, memoire, dernierWorkflow]);

    // Les noms ne servent qu'au fil. Là où un arbre le remplace, les résoudre
    // serait quatre requêtes par navigation sans destinataire : `useNomResolu`
    // n'émet rien sans identifiant.
    const aResoudre = workflowCourant?.presentationContexte !== 'arbre';
    const pourFil = (niveau: Niveau) => aResoudre ? contexteUrl[niveau] : undefined;

    const formation = useNiveauResolu(FORMATION, pourFil(FORMATION), contexteUrl);
    const promotion = useNiveauResolu(PROMOTION, pourFil(PROMOTION), contexteUrl);
    const option = useNiveauResolu(OPTION, pourFil(OPTION), contexteUrl);
    const periode = useNiveauResolu(PERIODE, pourFil(PERIODE), contexteUrl);

    const valeur = useMemo<ValeurContexteHierarchie>(() => {
        const parNiveau: Partial<Record<Niveau, NiveauResolu>> = {
            [FORMATION]: formation, [PROMOTION]: promotion, [OPTION]: option, [PERIODE]: periode,
        };
        const parUrl: Partial<Record<Niveau, NiveauResolu>> = {};
        for (const niveau of NIVEAUX) {
            const resolu = parNiveau[niveau];
            if (resolu !== undefined) parUrl[niveau] = resolu;
        }
        return {
            parUrl, pourNavigation, workflowCourant,
            chemins: memoire.chemins,
            dernierWorkflow: memoire.dernierWorkflow ?? null,
        };
    }, [formation, promotion, option, periode, pourNavigation, workflowCourant, memoire]);

    return <ContexteHierarchie value={valeur}>{children}</ContexteHierarchie>;
}
