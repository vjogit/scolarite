/**
 * Ce qu'est une option, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/freres.ts`, les routes du
 * catalogue et l'arbre ont besoin du repository, des actions de descente et
 * de la description sans rien vouloir du composant : la couche service n'a
 * pas à dépendre d'un module d'écran pour atteindre une définition de
 * données.
 */

import GroupsIcon from '@mui/icons-material/Groups';
import ListAltIcon from '@mui/icons-material/ListAlt';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_OPTION, GROUPE, OPTION, PERIODE, STRUCTURE, ENDPOINT_OPTION_DELETE_IMPACT } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { z } from 'zod';

export const optionSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, "Le nom est requis"),
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
export const ACTION_GROUPES: ActionNavigation<FieldValues> = {
    id: 'groupes',
    libelle: 'Gérer les groupes',
    icone: GroupsIcon,
    segment: GROUPE,
};

/** Descente vers les périodes de l'option. */
export const ACTION_PERIODES: ActionNavigation<FieldValues> = {
    id: 'periodes',
    libelle: 'Gérer les périodes',
    icone: ListAltIcon,
    segment: PERIODE,
};

/** Ce que l'option est, quel que soit l'écran qui l'affiche. */
export const optionEntite: DescriptionEntite = {
    title: "Options",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "l'option",
    entityLabelPlural: "options",
    suppressionEnCorbeille: true,
    entityGender: 'f',
};
