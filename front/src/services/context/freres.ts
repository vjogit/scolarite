/**
 * Les frères d'un niveau, empruntés aux repositories CRUD existants.
 *
 * Rien n'est redéfini ici : chaque niveau réutilise le repository que la liste
 * CRUD correspondante emploie déjà, avec sa clé de requête à l'identique. C'est
 * ce qui fait que l'ouverture d'un sélecteur sur un écran où la liste a déjà
 * été affichée ne coûte aucune requête — TanStack Query sert la même entrée de
 * cache.
 *
 * Corollaire à ne pas perdre de vue : la fonction de requête doit rester celle
 * du repository, mot pour mot. Une variante qui projetterait déjà les frères
 * écrirait une forme de donnée étrangère sous une clé partagée et corromprait
 * la liste. La projection se fait donc en aval, par `select`, qui ne touche pas
 * au cache.
 */

import type { QueryKey } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';

import type { Repository } from '../crud/def';
import { FORMATION, OPTION, PERIODE, PROMOTION } from '../../pages/structure/def';
import { formationRepository } from '../../pages/structure/Formation';
import { createPromotionRepository } from '../../pages/structure/Promotion';
import { createOptionRepository } from '../../pages/structure/Options';
import { createPeriodeRepository } from '../../pages/structure/Periode';
import type { ContexteHierarchique, Niveau } from './niveaux';
import { NIVEAUX } from './niveaux';

/** Une entrée de menu : l'identifiant tel qu'il ira dans l'URL, et son nom. */
export interface Frere {
    readonly identifiant: string;
    readonly nom: string;
}

/**
 * Ce qu'un sélecteur a besoin de savoir d'un repository, débarrassé du type de
 * l'entité : les quatre niveaux doivent tenir dans une même variable.
 */
export interface DepotFreres {
    readonly queryKey: QueryKey;
    readonly fetchAll: () => Promise<readonly unknown[]>;
    readonly versFreres: (donnees: readonly unknown[]) => Frere[];
}

function depot<D extends FieldValues>(repository: Repository<D>): DepotFreres {
    return {
        queryKey: repository.queryKey,
        fetchAll: repository.fetchAll,
        // Le transtypage est sûr et local : `fetchAll` ci-dessus est celui de ce
        // même repository, donc ce que `select` reçoit sous cette clé est bien
        // un `D[]`. Il n'y a pas d'autre manière d'effacer le type de l'entité
        // sans perdre la contravariance de `getId` et `getName`.
        versFreres: donnees => (donnees as D[]).map(donnee => ({
            identifiant: String(repository.getId(donnee)),
            nom: repository.getName(donnee),
        })),
    };
}

/** Le niveau dont l'identifiant filtre les frères. `null` pour la racine. */
export function niveauParent(niveau: Niveau): Niveau | null {
    const rang = NIVEAUX.indexOf(niveau);
    return rang <= 0 ? null : NIVEAUX[rang - 1];
}

/**
 * Le dépôt des frères d'un niveau dans un contexte donné.
 *
 * `null` quand le parent est inconnu : le sélecteur est alors inutilisable et
 * ne doit émettre aucune requête, faute de savoir quoi demander.
 */
export function depotFreres(niveau: Niveau, contexte: ContexteHierarchique): DepotFreres | null {
    if (niveau === FORMATION) return depot(formationRepository);

    const parent = niveauParent(niveau);
    const identifiantParent = parent === null ? undefined : contexte[parent];
    if (identifiantParent === undefined) return null;

    switch (niveau) {
        case PROMOTION: return depot(createPromotionRepository(identifiantParent));
        case OPTION: return depot(createOptionRepository(identifiantParent));
        case PERIODE: return depot(createPeriodeRepository(identifiantParent));
    }
}
