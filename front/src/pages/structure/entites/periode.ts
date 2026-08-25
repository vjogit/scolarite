/**
 * Ce qu'est une période, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/freres.ts`, les routes des
 * notes et l'arbre ont besoin du repository, des actions de descente et de la
 * description sans rien vouloir du composant : la couche service n'a pas à
 * dépendre d'un module d'écran pour atteindre une définition de données.
 */

import ListAltIcon from '@mui/icons-material/ListAlt';
import type { TFunction } from 'i18next';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_PERIODE, PERIODE, STRUCTURE, UES, ENDPOINT_PERIODE_DELETE_IMPACT } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { messageValidation } from '../../../i18n/validation';
import { z } from 'zod';

export const periodeSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, { error: messageValidation('nomRequis') }),
    debut: z.coerce.date(),
    fin: z.coerce.date(),
    option_id: z.number(),
}).refine((data) => data.fin > data.debut, {
    error: messageValidation('dateFinApresDebut'),
    path: ["fin"],
});

export type Periode = z.infer<typeof periodeSchema>;

// Partie statique : à l'extérieur du composant
export const createPeriodeRepository = (optionId: string) => {
    return createRepository<Periode>({
        endpoint: ENDPOINT_PERIODE,
        deleteImpactEndpoint: ENDPOINT_PERIODE_DELETE_IMPACT,
        queryParams: `?option_id=${optionId}`,
        queryKey: [STRUCTURE, PERIODE, optionId],
        getId: (data: Periode) => data.id,
    })
}

/** Descente vers les UE de la période. */
export function ACTION_UES(t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return {
        id: 'ues',
        libelle: tCrud(t)('entites.actions.gererUe', { ns: 'crud' }),
        icone: ListAltIcon,
        segment: UES,
    };
}

/** Ce que la période est, quel que soit l'écran qui l'affiche. */
export function periodeEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.periode.title', { ns: 'crud' }),
        roleEcriture: Role.STRUCTURE_ECRITURE,
        entityLabel: traduire('entites.periode.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.periode.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.periode.nomPluriel', { ns: 'crud' }),
        entityGender: 'f',
        suppressionEnCorbeille: true,
    };
}
