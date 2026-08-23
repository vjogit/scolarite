/**
 * Ce qu'est une formation, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/freres.ts` et l'arbre de la
 * structure ont besoin du repository, des actions de descente et de la
 * description sans rien vouloir du composant : la couche service n'a pas à
 * dépendre d'un module d'écran pour atteindre une définition de données.
 */

import ListAltIcon from '@mui/icons-material/ListAlt';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_FORMATION, FORMATION, PROMOTION, STRUCTURE, ENDPOINT_FORMATION_DELETE_IMPACT } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { z } from 'zod';

export const formationSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, "Le nom est requis")
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
export const ACTION_PROMOTIONS: ActionNavigation<FieldValues> = {
    id: 'promotions',
    libelle: 'Gérer les promotions',
    icone: ListAltIcon,
    segment: PROMOTION,
};

/** Ce que la formation est, quel que soit l'écran qui l'affiche. */
export const formationEntite: DescriptionEntite = {
    title: "Formations",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "la formation",
    entityLabelPlural: "formations",
    deleteRequiresNameConfirmation: true,
    suppressionEnCorbeille: true,
};
