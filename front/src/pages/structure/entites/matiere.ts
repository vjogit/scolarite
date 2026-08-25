/**
 * Ce qu'est une matière, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/prolongements.ts` et l'arbre
 * de la structure ont besoin du repository et de la description sans rien
 * vouloir du composant : la couche service n'a pas à dépendre d'un module
 * d'écran pour atteindre une définition de données.
 */

import type { TFunction } from 'i18next';
import { ENDPOINT_MATIERE, MATIERE, STRUCTURE } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { messageValidation } from '../../../i18n/validation';
import { z } from 'zod';

export const matiereSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, { error: messageValidation('nomRequis') }),
    coeff: z.number().min(0, { error: messageValidation('coefficientDoitEtrePositif') }),
    heure: z.number().min(0, { error: messageValidation('heuresDoiventEtrePositives') }),
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
export function matiereEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.matiere.title', { ns: 'crud' }),
        roleEcriture: Role.STRUCTURE_ECRITURE,
        entityLabel: traduire('entites.matiere.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.matiere.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.matiere.nomPluriel', { ns: 'crud' }),
        entityGender: 'f',
    };
}
