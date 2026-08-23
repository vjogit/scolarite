/**
 * Ce qu'est une période, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/freres.ts`, les routes des
 * notes et l'arbre ont besoin du repository, des actions de descente et de la
 * description sans rien vouloir du composant : la couche service n'a pas à
 * dépendre d'un module d'écran pour atteindre une définition de données.
 */

import ListAltIcon from '@mui/icons-material/ListAlt';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_PERIODE, PERIODE, STRUCTURE, UES, ENDPOINT_PERIODE_DELETE_IMPACT } from '../def';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { z } from 'zod';

export const periodeSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    debut: z.coerce.date(),
    fin: z.coerce.date(),
    option_id: z.number(),
}).refine((data) => data.fin > data.debut, {
    message: "La date de fin doit être postérieure à la date de début",
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
export const ACTION_UES: ActionNavigation<FieldValues> = {
    id: 'ues',
    libelle: 'Gérer les UE',
    icone: ListAltIcon,
    segment: UES,
};

/** Ce que la période est, quel que soit l'écran qui l'affiche. */
export const periodeEntite: DescriptionEntite = {
    title: "Périodes",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "la période",
    entityLabelPlural: "périodes",
    suppressionEnCorbeille: true,
};
