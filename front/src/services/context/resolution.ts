/**
 * Résolution du nom d'une entité du fil de contexte.
 *
 * Deux sources, dans l'ordre :
 *
 * - la requête de détail `GET endpoint/id`, sous une clé `[segment, id]`
 *   partagée avec tout écran qui fait déjà ce fetch — c'est elle qui fait foi ;
 * - en attendant sa réponse, la liste du niveau déjà en cache : les noms y
 *   figurent, et c'est le cas courant puisqu'on arrive presque toujours sur un
 *   écran en ayant traversé la liste de son parent. Lecture pure par
 *   `getQueryData` : rien n'est écrit sous la clé de la liste.
 *
 * C'est la combinaison qui interdit le `#12` : tant qu'aucune source ne connaît
 * le nom, `nom` reste `null` et l'affichage montre un squelette, jamais
 * l'identifiant.
 */

import { useMemo } from 'react';
import { skipToken, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { apiInstance } from '../api';
import type { NiveauResolu } from './contexte';
import type { DepotFreres } from './freres';

/**
 * Fraîcheur commune à toutes les résolutions de nom du fil : la même que celle
 * des sélecteurs, pour que traverser un écran ne redemande jamais un nom que
 * le cache connaît déjà.
 */
export const DUREE_FRAICHEUR_NOMS = 5 * 60 * 1000;

export function useNomResolu({ cle, endpoint, identifiant, projeter, depotParent }: {
    cle: QueryKey;
    endpoint: string;
    identifiant: string | undefined;
    projeter: (donnee: unknown) => string | null;
    /** Liste du même niveau, filtrée par le parent ; `null` sans parent connu. */
    depotParent: DepotFreres | null;
}): NiveauResolu | undefined {
    const client = useQueryClient();

    const { data } = useQuery({
        queryKey: cle,
        queryFn: identifiant === undefined
            ? skipToken
            : async () => {
                const reponse = await apiInstance.get<unknown>(`${endpoint}/${identifiant}`);
                return reponse.data;
            },
        staleTime: DUREE_FRAICHEUR_NOMS,
    });

    return useMemo(() => {
        if (identifiant === undefined) return undefined;

        let nom = data === undefined ? null : projeter(data);
        if (nom === null && data === undefined && depotParent !== null) {
            const liste = client.getQueryData(depotParent.queryKey);
            if (Array.isArray(liste)) {
                nom = depotParent.versFreres(liste)
                    .find(frere => frere.identifiant === identifiant)?.nom ?? null;
            }
        }

        return { identifiant, nom, enChargement: data === undefined && nom === null };
    }, [identifiant, data, projeter, depotParent, client]);
}
