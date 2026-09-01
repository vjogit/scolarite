/**
 * Ce qu'est un groupe, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/prolongements.ts` et l'arbre
 * de la structure ont besoin du repository, des actions de descente et de la
 * description sans rien vouloir du composant : la couche service n'a pas à
 * dépendre d'un module d'écran pour atteindre une définition de données.
 */

import { Users } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_GROUPE, GROUPE, STRUCTURE } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { messageValidation } from '../../../i18n/validation';
import { z } from 'zod';

export const groupeSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, { error: messageValidation('nomRequis') }),
    option_id: z.number(),
});

export type Groupe = z.infer<typeof groupeSchema>;

export const createGroupeRepository = (optionId: string) =>
    createRepository<Groupe>({
        endpoint: ENDPOINT_GROUPE,
        queryParams: `?option_id=${optionId}`,
        queryKey: [STRUCTURE, GROUPE, optionId],
        getId: (data: Groupe) => data.id,
    });

/**
 * Descente vers les membres du groupe. Le segment `user` est celui de la
 * greffe `MEMBRES` du catalogue, seul workflow où les groupes apparaissent.
 */
export function ACTION_MEMBRES(t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return {
        id: 'membres',
        libelle: tCrud(t)('entites.actions.gererMembres', { ns: 'crud' }),
        icone: Users,
        segment: 'user',
    };
}

/** Ce que le groupe est, quel que soit l'écran qui l'affiche. */
export function groupeEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.groupe.title', { ns: 'crud' }),
        roleEcriture: Role.STRUCTURE_ECRITURE,
        entityLabel: traduire('entites.groupe.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.groupe.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.groupe.nomPluriel', { ns: 'crud' }),
    };
}
