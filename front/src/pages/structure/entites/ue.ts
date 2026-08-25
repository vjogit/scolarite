/**
 * Ce qu'est une unité d'enseignement, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/prolongements.ts`, les routes
 * des notes et l'arbre ont besoin du repository, des actions de descente et
 * de la description sans rien vouloir du composant : la couche service n'a
 * pas à dépendre d'un module d'écran pour atteindre une définition de
 * données.
 */

import ListAltIcon from '@mui/icons-material/ListAlt';
import type { TFunction } from 'i18next';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_UES, MATIERE, STRUCTURE, UES } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { messageValidation } from '../../../i18n/validation';
import { z } from 'zod';

export const ueSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, { error: messageValidation('nomRequis') }),
    ects: z.number().min(0, { error: messageValidation('ectsDoiventEtrePositifs') }),
    academique: z.boolean(),
    periode_id: z.number(),
})

export type Ue = z.infer<typeof ueSchema>;

// Partie statique : à l'extérieur du composant
export const createUeRepository = (periodeId: string) => {
    return createRepository<Ue>({
        endpoint: ENDPOINT_UES,
        queryParams: `?periode_id=${periodeId}`,
        queryKey: [STRUCTURE, UES, periodeId],
        getId: (data: Ue) => data.id,
    })
}

/** Descente vers les matières de l'UE. */
export function ACTION_MATIERES(t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return {
        id: 'matieres',
        libelle: tCrud(t)('entites.actions.gererMatieres', { ns: 'crud' }),
        icone: ListAltIcon,
        segment: MATIERE,
    };
}

/** Ce que l'UE est, quel que soit l'écran qui l'affiche. */
export function ueEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.ue.title', { ns: 'crud' }),
        roleEcriture: Role.STRUCTURE_ECRITURE,
        entityLabel: traduire('entites.ue.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.ue.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.ue.nomPluriel', { ns: 'crud' }),
        entityGender: 'f',
    };
}
