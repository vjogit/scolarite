/**
 * Ce qu'est une matière, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/prolongements.ts` et l'arbre
 * de la structure ont besoin du repository et de la description sans rien
 * vouloir du composant : la couche service n'a pas à dépendre d'un module
 * d'écran pour atteindre une définition de données.
 */

import { ENDPOINT_MATIERE, MATIERE, STRUCTURE } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { z } from 'zod';

export const matiereSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    coeff: z.number().min(0, "Le coefficient doit être positif"),
    heure: z.number().min(0, "Les heures doit être positive"),
    unite_enseignement_id: z.number(),
    color: z.string().nullable().optional(),
});

export type Matiere = z.infer<typeof matiereSchema>;

// Partie statique : à l'extérieur du composant
export const createMatiereRepository = (ueId: string) => {
    return createRepository<Matiere>({
        endpoint: ENDPOINT_MATIERE,
        queryParams: `?unite_enseignement_id=${ueId}`,
        queryKey: [STRUCTURE, MATIERE, ueId],
        getId: (data: Matiere) => data.id,
    })
}

/** Ce que la matière est, quel que soit l'écran qui l'affiche. */
export const matiereEntite: DescriptionEntite = {
    title: "Matières",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "la matière",
    entityLabelPlural: "matières",
};
