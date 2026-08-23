/**
 * Ce qu'est un groupe, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/prolongements.ts` et l'arbre
 * de la structure ont besoin du repository, des actions de descente et de la
 * description sans rien vouloir du composant : la couche service n'a pas à
 * dépendre d'un module d'écran pour atteindre une définition de données.
 */

import PeopleIcon from '@mui/icons-material/People';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_GROUPE, GROUPE, STRUCTURE } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { z } from 'zod';

export const groupeSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
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
export const ACTION_MEMBRES: ActionNavigation<FieldValues> = {
    id: 'membres',
    libelle: 'Gérer les membres',
    icone: PeopleIcon,
    segment: 'user',
};

/** Ce que le groupe est, quel que soit l'écran qui l'affiche. */
export const groupeEntite: DescriptionEntite = {
    title: "Groupes",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "le groupe",
    entityLabelPlural: "groupes",
};
