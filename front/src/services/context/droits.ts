/**
 * Droits de l'utilisateur courant, lus une seule fois depuis la session.
 *
 * Toute décision d'affichage liée aux rôles passe par ce hook plutôt que par
 * une lecture directe de `session.user.roles`. On ne teste jamais `ADMIN` :
 * composite Keycloak, son porteur possède déjà tous les rôles fonctionnels
 * dans `realm_access.roles` — un test explicite sur `ADMIN` signalerait un
 * rôle fonctionnel manquant.
 *
 * L'interface n'est pas une frontière de sécurité : elle reflète les droits,
 * le serveur les impose.
 */

import { useCallback } from 'react';
import { useSession } from '../../SessionContext';
import { possedeUnRole } from './workflows';

/** Ce qu'un écran doit déclarer pour qu'on puisse statuer sur son écriture. */
export interface CibleEcriture {
    /** Écran jamais modifiable, indépendamment des droits. Prime sur le rôle. */
    readonly isReadOnly?: boolean;
    /** Rôle d'écriture de l'entité, aligné sur la route serveur. */
    readonly roleEcriture?: string;
}

export function useDroits() {
    const { session } = useSession();
    const roles = session?.user.roles;

    const possedeRole = useCallback(
        (role: string) => possedeUnRole(roles, [role]),
        [roles],
    );

    // Sans `roleEcriture` déclaré, aucune écriture : c'est le défaut sûr, qui
    // couvre les écrans purement calculés dépourvus de route d'écriture.
    const peutEcrire = useCallback(
        (cible: CibleEcriture) =>
            !cible.isReadOnly
            && cible.roleEcriture !== undefined
            && possedeUnRole(roles, [cible.roleEcriture]),
        [roles],
    );

    return { possedeRole, peutEcrire };
}
