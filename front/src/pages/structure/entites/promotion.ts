/**
 * Ce qu'est une promotion, indépendamment de l'écran qui l'affiche.
 *
 * Séparé de la page parce que `services/context/freres.ts` et l'arbre de la
 * structure ont besoin du repository, des actions de descente et de la
 * description sans rien vouloir du composant : la couche service n'a pas à
 * dépendre d'un module d'écran pour atteindre une définition de données.
 */

import ListAltIcon from '@mui/icons-material/ListAlt';
import type { TFunction } from 'i18next';
import type { ActionNavigation } from '../../../services/crud/actions';
import type { FieldValues } from 'react-hook-form';
import { ENDPOINT_PROMOTION, OPTION, PROMOTION, STRUCTURE, ENDPOINT_PROMOTION_DELETE_IMPACT } from '../def';
import { IsValidEchelle } from '../service';
import { Role } from '../../user/def';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { messageValidation } from '../../../i18n/validation';
import { z } from 'zod';

const echelleRegexReelsLettresFixes = /^(a=[0-9]+(\.[0-9]+)?)(,b=[0-9]+(\.[0-9]+)?)(,c=[0-9]+(\.[0-9]+)?)(,d=[0-9]+(\.[0-9]+)?)(,e=[0-9]+(\.[0-9]+)?)(,f=[0-9]+(\.[0-9]+)?)$/;
const messageEchelleGpaInvalide = messageValidation('echelleFormatGpa');
const echelleRegexReelsLettresFixesUe = /^(a=[0-9]+(\.[0-9]+)?)(,b=[0-9]+(\.[0-9]+)?)(,c=[0-9]+(\.[0-9]+)?)(,d=[0-9]+(\.[0-9]+)?)(,e=[0-9]+(\.[0-9]+)?)$/;
const messageEchelleUeInvalide = messageValidation('echelleFormatUe');

export const promotionSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, { error: messageValidation('nomRequis') }),
    debut: z.coerce.date(),
    fin: z.coerce.date(),
    echelle_gpa: z.union([
        z.string().superRefine((echelle, ctx) => {
            const error = IsValidEchelle(echelle, echelleRegexReelsLettresFixes, messageEchelleGpaInvalide);
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
            const error = IsValidEchelle(echelle, echelleRegexReelsLettresFixesUe, messageEchelleUeInvalide);
            if (error) {
                ctx.addIssue({
                    code: "custom",
                    message: error,
                });
            }
        }).transform((val) => val.split(',').map(part => parseFloat(part.split('=')[1] ?? ''))),
        z.array(z.number())
    ]),
    bareme: z.number({ error: messageValidation('baremeRequis') })
        .positive({ error: messageValidation('baremeStrictementPositif') }),
    matiere_eliminatoire: z.boolean().nullable().optional(),
    value_matiere_eliminatoire: z.number().min(0, { error: messageValidation('noteDoitEtrePositive') }).nullable().optional(),
    formation_id: z.number(),
}).refine((data) => data.fin > data.debut, {
    error: messageValidation('dateFinApresDebut'),
    path: ["fin"], // L'erreur sera attachée au champ 'fin'
}).refine((data) => {
    if (data.matiere_eliminatoire) {
        return data.value_matiere_eliminatoire != null;
    }
    return true;
}, {
    error: messageValidation('noteEliminatoireRequise'),
    path: ["value_matiere_eliminatoire"],
}).refine((data) => {
    // Miroir de la contrainte SQL chk_promotion_echelle_bareme. echelle est déjà
    // validée décroissante par ailleurs : son premier seuil en est le maximum.
    const seuils = Array.isArray(data.echelle) ? data.echelle : [];
    const [premierSeuil] = seuils;
    return premierSeuil === undefined || premierSeuil <= data.bareme;
}, {
    error: messageValidation('seuilsEchelleDepassentBareme'),
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
export function ACTION_OPTIONS(t?: TFunction<'crud'>): ActionNavigation<FieldValues> {
    return {
        id: 'options',
        libelle: tCrud(t)('entites.actions.gererOptions', { ns: 'crud' }),
        icone: ListAltIcon,
        segment: OPTION,
    };
}

/** Ce que la promotion est, quel que soit l'écran qui l'affiche. */
export function promotionEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.promotion.title', { ns: 'crud' }),
        roleEcriture: Role.STRUCTURE_ECRITURE,
        entityLabel: traduire('entites.promotion.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.promotion.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.promotion.nomPluriel', { ns: 'crud' }),
        entityGender: 'f',
        deleteRequiresNameConfirmation: true,
        suppressionEnCorbeille: true,
    };
}
