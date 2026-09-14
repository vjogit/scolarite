import { skipToken, useQuery } from '@tanstack/react-query';

import { DUREE_FRAICHEUR_NOMS } from '../../services/context/resolution';
import { userRepository } from '../user/entites/user';

export interface NomResponsable {
    /** Vrai tant qu'un identifiant est donné et que son nom n'est pas arrivé. */
    readonly enChargement: boolean;
    readonly prenom: string;
    readonly nom: string;
}

/**
 * Le nom du responsable d'une fiche, dont le serveur ne livre que
 * l'identifiant. Lu par la requête de détail du repository utilisateurs, sous
 * la clé que l'écran utilisateurs emploie déjà (`[USER, id]`, invariant 2) :
 * c'est la seule requête que les écrans syllabus ajoutent, et seulement quand
 * un responsable est désigné.
 */
export function useNomResponsable(responsableId: number | null | undefined): NomResponsable {
    const identifiant = typeof responsableId === 'number' ? String(responsableId) : null;

    const { data, isError } = useQuery({
        queryKey: [...userRepository.queryKey, identifiant],
        queryFn: identifiant === null ? skipToken : () => userRepository.fetch(identifiant),
        staleTime: DUREE_FRAICHEUR_NOMS,
    });

    return {
        enChargement: identifiant !== null && data === undefined && !isError,
        prenom: data?.firstName ?? '',
        nom: data?.lastName ?? '',
    };
}
