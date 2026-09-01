/**
 * Ce qu'est une formation, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/freres.ts` et l'arbre de la
 * structure ont besoin du repository, des actions de descente et de la
 * description sans rien vouloir du composant : la couche service n'a pas à
 * dépendre d'un module d'écran pour atteindre une définition de données.
 */

import { List } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_FORMATION, FORMATION, PROMOTION, STRUCTURE, ENDPOINT_FORMATION_DELETE_IMPACT } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { messageValidation } from '../../../i18n/validation';
import { z } from 'zod';

export const formationSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, { error: messageValidation('nomRequis') })
});

export type Formation = z.infer<typeof formationSchema>;

// Partie statique : à l'extérieur du composant
export const formationRepository = createRepository<Formation>({
    endpoint: ENDPOINT_FORMATION,
    deleteImpactEndpoint: ENDPOINT_FORMATION_DELETE_IMPACT,
    queryKey: [STRUCTURE, FORMATION],
    getId: (data: Formation) => data.id,
});


/** Descente vers les promotions de la formation. */
export function ACTION_PROMOTIONS(t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return {
        id: 'promotions',
        libelle: tCrud(t)('entites.actions.gererPromotions', { ns: 'crud' }),
        icone: List,
        segment: PROMOTION,
    };
}

/** Ce que la formation est, quel que soit l'écran qui l'affiche. */
export function formationEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.formation.title', { ns: 'crud' }),
        roleEcriture: Role.STRUCTURE_ECRITURE,
        entityLabel: traduire('entites.formation.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.formation.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.formation.nomPluriel', { ns: 'crud' }),
        entityGender: 'f',
        deleteRequiresNameConfirmation: true,
        suppressionEnCorbeille: true,
    };
}
