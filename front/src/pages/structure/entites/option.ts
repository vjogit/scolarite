/**
 * Ce qu'est une option, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/freres.ts`, les routes du
 * catalogue et l'arbre ont besoin du repository, des actions de descente et
 * de la description sans rien vouloir du composant : la couche service n'a
 * pas à dépendre d'un module d'écran pour atteindre une définition de
 * données.
 */

import { List, Users } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_OPTION, GROUPE, OPTION, PERIODE, STRUCTURE, ENDPOINT_OPTION_DELETE_IMPACT } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { messageValidation } from '../../../i18n/validation';
import { z } from 'zod';

export const optionSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, { error: messageValidation('nomRequis') }),
    promotion_id: z.number(),
})

export type Option = z.infer<typeof optionSchema>;

// Partie statique : à l'extérieur du composant
export const createOptionRepository = (promotionId: string) => {
    return createRepository<Option>({
        endpoint: ENDPOINT_OPTION,
        deleteImpactEndpoint: ENDPOINT_OPTION_DELETE_IMPACT,
        queryParams: `?promotion_id=${promotionId}`,
        queryKey: [STRUCTURE,OPTION, promotionId],
        getId: (data: Option) => data.id,
    });
}

/** Descente vers les groupes de l'option. */
export function ACTION_GROUPES(t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return {
        id: 'groupes',
        libelle: tCrud(t)('entites.actions.gererGroupes', { ns: 'crud' }),
        icone: Users,
        segment: GROUPE,
    };
}

/** Descente vers les périodes de l'option. */
export function ACTION_PERIODES(t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return {
        id: 'periodes',
        libelle: tCrud(t)('entites.actions.gererPeriodes', { ns: 'crud' }),
        icone: List,
        segment: PERIODE,
    };
}

/** Ce que l'option est, quel que soit l'écran qui l'affiche. */
export function optionEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.option.title', { ns: 'crud' }),
        roleEcriture: Role.STRUCTURE_ECRITURE,
        entityLabel: traduire('entites.option.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.option.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.option.nomPluriel', { ns: 'crud' }),
        suppressionEnCorbeille: true,
        entityGender: 'f',
    };
}
