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
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_UES, MATIERE, STRUCTURE, UES } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { z } from 'zod';

export const ueSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    ects: z.number().min(0, "Les ects doivent être positifs"),
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
export const ACTION_MATIERES: ActionNavigation<FieldValues> = {
    id: 'matieres',
    libelle: 'Gérer les matières',
    icone: ListAltIcon,
    segment: MATIERE,
};

/** Ce que l'UE est, quel que soit l'écran qui l'affiche. */
export const ueEntite: DescriptionEntite = {
    title: "UE",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "l'UE",
    entityLabelPlural: "UE",
    entityGender: 'f',
};
