/**
 * Ce qu'est un utilisateur, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page sur le modèle de `pages/structure/entites/` : la fiche
 * syllabus (lot 2) résout le nom d'un responsable par la requête de détail de
 * ce repository, sous sa clé — celle que l'écran utilisateurs emploie déjà
 * pour son formulaire (invariant 2) — sans rien vouloir du composant.
 */

import { z } from 'zod';
import { createRepository } from '../../../services/crud/def';
import { messageValidation } from '../../../i18n/validation';
import { ENDPOINT_USER, USER } from '../def';

export const userSchema = z.object({
    id: z.number(),
    keycloak_id: z.string().nullish(),
    version: z.number(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.email({ error: messageValidation('emailInvalide') }).optional().or(z.literal('')),
    password: z.string().optional(),
    roles: z.union([
        z.string().transform((val) => val.split(',').map(r => r.trim()).filter(r => r !== '')),
        z.array(z.string())
    ]).optional(),
});

export type User = z.infer<typeof userSchema>;

export const userRepository = createRepository<User>({
    endpoint: ENDPOINT_USER,
    queryKey: [USER],
    getId: (data: User) => data.id,
});
