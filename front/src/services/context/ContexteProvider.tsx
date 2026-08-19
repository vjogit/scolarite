import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { skipToken, useQuery } from '@tanstack/react-query';

import { apiInstance } from '../api';
import { ENDPOINT_PAR_NIVEAU, NIVEAUX, type EntiteNommee, type Niveau } from './niveaux';
import { FORMATION, OPTION, PERIODE, PROMOTION } from '../../pages/structure/def';
import { extraireContexte, fusionnerContexte } from './navigation';
import { trouverWorkflow } from './workflows';
import { etatNavigation, majEtatNavigation, sAbonnerNavigation, type EtatNavigation } from './stockage';
import { ContexteHierarchie, type NiveauResolu, type ValeurContexteHierarchie } from './contexte';

/**
 * Résout le nom d'un niveau.
 *
 * La clé de requête et la durée de fraîcheur reprennent celles du fil
 * d'Ariane : TanStack Query dédoublonne, et le contexte n'ajoute aucun appel
 * réseau à un écran qui affiche déjà son fil d'Ariane.
 */
function useNiveauResolu(niveau: Niveau, identifiant: string | undefined): NiveauResolu | undefined {
    const { data } = useQuery({
        queryKey: [niveau, identifiant],
        queryFn: identifiant === undefined
            ? skipToken
            : async () => {
                const reponse = await apiInstance.get<EntiteNommee>(`${ENDPOINT_PAR_NIVEAU[niveau]}/${identifiant}`);
                return reponse.data;
            },
        staleTime: 5 * 60 * 1000,
    });

    return useMemo(() => {
        if (identifiant === undefined) return undefined;
        return { identifiant, nom: data?.name ?? null, enChargement: data === undefined };
    }, [identifiant, data]);
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

    // Synchronisation vers le magasin : la mémoire suit l'URL, jamais l'inverse.
    useEffect(() => {
        const chemins = { ...memoire.chemins };
        // La racine d'un workflow est une redirection, pas une position.
        if (workflowCourant !== null && pathname !== `/${workflowCourant.chemin}`) {
            chemins[workflowCourant.id] = pathname;
        }

        const suivant: EtatNavigation = { contexte: pourNavigation, chemins };
        majEtatNavigation(suivant);
    }, [pathname, workflowCourant, pourNavigation, memoire]);

    const formation = useNiveauResolu(FORMATION, contexteUrl[FORMATION]);
    const promotion = useNiveauResolu(PROMOTION, contexteUrl[PROMOTION]);
    const option = useNiveauResolu(OPTION, contexteUrl[OPTION]);
    const periode = useNiveauResolu(PERIODE, contexteUrl[PERIODE]);

    const valeur = useMemo<ValeurContexteHierarchie>(() => {
        const parNiveau: Partial<Record<Niveau, NiveauResolu>> = {
            [FORMATION]: formation, [PROMOTION]: promotion, [OPTION]: option, [PERIODE]: periode,
        };
        const parUrl: Partial<Record<Niveau, NiveauResolu>> = {};
        for (const niveau of NIVEAUX) {
            const resolu = parNiveau[niveau];
            if (resolu !== undefined) parUrl[niveau] = resolu;
        }
        return { parUrl, pourNavigation, workflowCourant, chemins: memoire.chemins };
    }, [formation, promotion, option, periode, pourNavigation, workflowCourant, memoire]);

    return <ContexteHierarchie value={valeur}>{children}</ContexteHierarchie>;
}
