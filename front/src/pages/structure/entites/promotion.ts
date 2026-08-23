/**
 * Ce qu'est une promotion, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/freres.ts` et l'arbre de la
 * structure ont besoin du repository, des actions de descente et de la
 * description sans rien vouloir du composant : la couche service n'a pas à
 * dépendre d'un module d'écran pour atteindre une définition de données.
 */

import ListAltIcon from '@mui/icons-material/ListAlt';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_PROMOTION, OPTION, PROMOTION, STRUCTURE, ENDPOINT_PROMOTION_DELETE_IMPACT } from '../def';
import { IsValidEchelle } from '../service';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { z } from 'zod';

const echelleRegexReelsLettresFixes = /^(a=[0-9]+(\.[0-9]+)?)(,b=[0-9]+(\.[0-9]+)?)(,c=[0-9]+(\.[0-9]+)?)(,d=[0-9]+(\.[0-9]+)?)(,e=[0-9]+(\.[0-9]+)?)(,f=[0-9]+(\.[0-9]+)?)$/;
const erreurEchelle_gpa = "Le format n'est pas correct (ex: a=4,b=3.5,c=3,d=2.5,e=2,f=0)" 
const echelleRegexReelsLettresFixesUe = /^(a=[0-9]+(\.[0-9]+)?)(,b=[0-9]+(\.[0-9]+)?)(,c=[0-9]+(\.[0-9]+)?)(,d=[0-9]+(\.[0-9]+)?)(,e=[0-9]+(\.[0-9]+)?)$/;
const erreurEchelleUe = "Le format n'est pas correct (ex: a=16.0,b=14.0,c=12.0,d=10.0,e=8.0)"

export const promotionSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, "Le nom est requis"),
    debut: z.coerce.date(),
    fin: z.coerce.date(),
    echelle_gpa: z.union([
        z.string().superRefine((echelle, ctx) => {
            const error = IsValidEchelle(echelle, echelleRegexReelsLettresFixes, erreurEchelle_gpa);
            if (error) {
                ctx.addIssue({
                    code: "custom",
                    message: error,
                });
            }
        }).transform((val) => val.split(',').map(part => parseFloat(part.split('=')[1] ?? ''))),
        z.array(z.number())
    ]),
    echelle: z.union([
        z.string().superRefine((echelle, ctx) => {
            const error = IsValidEchelle(echelle, echelleRegexReelsLettresFixesUe, erreurEchelleUe);
            if (error) {
                ctx.addIssue({
                    code: "custom",
                    message: error,
                });
            }
        }).transform((val) => val.split(',').map(part => parseFloat(part.split('=')[1] ?? ''))),
        z.array(z.number())
    ]),
    bareme: z.number({ message: "Le barème est requis" })
        .positive("Le barème doit être strictement positif"),
    matiere_eliminatoire: z.boolean().nullable().optional(),
    value_matiere_eliminatoire: z.number().min(0, "La note doit être positive").nullable().optional(),
    formation_id: z.number(),
}).refine((data) => data.fin > data.debut, {
    message: "La date de fin doit être postérieure à la date de début",
    path: ["fin"], // L'erreur sera attachée au champ 'fin'
}).refine((data) => {
    if (data.matiere_eliminatoire) {
        return data.value_matiere_eliminatoire != null;
    }
    return true;
}, {
    message: "La note éliminatoire est requise si l'option est activée.",
    path: ["value_matiere_eliminatoire"],
}).refine((data) => {
    // Miroir de la contrainte SQL chk_promotion_echelle_bareme. echelle est déjà
    // validée décroissante par ailleurs : son premier seuil en est le maximum.
    const seuils = Array.isArray(data.echelle) ? data.echelle : [];
    const [premierSeuil] = seuils;
    return premierSeuil === undefined || premierSeuil <= data.bareme;
}, {
    message: "Les seuils de l'échelle ne peuvent pas dépasser le barème",
    path: ["echelle"],
});

export type Promotion = z.infer<typeof promotionSchema>;

// Partie statique : à l'extérieur du composant
export const createPromotionRepository = (formationId: string) => {
    return createRepository<Promotion>({
        endpoint: ENDPOINT_PROMOTION,
        deleteImpactEndpoint: ENDPOINT_PROMOTION_DELETE_IMPACT,
        queryKey: [STRUCTURE, PROMOTION, formationId],
        queryParams: `?formation_id=${formationId}`,
        getId: (data: Promotion) => data.id,
    });
}

/** Descente vers les options de la promotion. */
export const ACTION_OPTIONS: ActionNavigation<FieldValues> = {
    id: 'options',
    libelle: 'Gérer les options',
    icone: ListAltIcon,
    segment: OPTION,
};

/** Ce que la promotion est, quel que soit l'écran qui l'affiche. */
export const promotionEntite: DescriptionEntite = {
    title: "Promotions",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "la promotion",
    entityLabelPlural: "promotions",
    deleteRequiresNameConfirmation: true,
    suppressionEnCorbeille: true,
};
