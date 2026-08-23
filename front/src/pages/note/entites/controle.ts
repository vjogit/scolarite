/**
 * Ce qu'est un contrôle, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de `Controle.tsx` pour la même raison que les entités de la
 * structure : `services/context/prolongements.ts` a besoin du repository pour
 * résoudre les frères d'un contrôle, sans rien vouloir du composant.
 */

import { CONTROLE, ENDPOINT_CONTROLE, RESULTAT } from '../def';
import { createRepository } from '../../../services/crud/def';
import { z } from 'zod';

export const controleSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    coeff: z.preprocess(
        (val) => (Number.isNaN(val as number) ? undefined : val),
        z.number().nullable().optional()
    ),
    is_rattrapage: z.boolean().default(false),
    remarque: z.string().nullable().optional(),
    matiere_id: z.number(),
    // Renvoyé par GET /resultat/controle/{id} uniquement : le barème appartient
    // à la promotion, il n'est pas saisi ici. Optionnel car la liste des
    // contrôles d'une matière ne le rapporte pas.
    bareme: z.number().optional(),
});

export type Controle = z.infer<typeof controleSchema>;

// Partie statique : à l'extérieur du composant
export const createControleRepository = (matiereId: string) => {
    return createRepository<Controle>({
        endpoint: ENDPOINT_CONTROLE,
        queryParams: `?matiere_id=${matiereId}`,
        queryKey: [RESULTAT, CONTROLE, matiereId],

        getId: (data: Controle) => data.id,
    })
}
