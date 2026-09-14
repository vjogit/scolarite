/**
 * Ce qu'est le syllabus, indépendamment des écrans qui l'affichent : la fiche
 * d'une matière, les deux champs syllabus de l'UE, et l'action qui y mène.
 *
 * Contrat des routes (lot 1) : la fiche « existe » toujours — le GET renvoie
 * une fiche vide en version 0 quand rien n'a jamais été écrit — et le PUT est
 * un upsert sous verrou optimiste (409 `OPTIMISTIC_LOCKING_FAILURE`). Le PUT
 * de l'UE renvoie l'UE complète, pour la reposer sous la clé du repository UE.
 */

import { BookText } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { FieldValues } from 'react-hook-form';
import { z } from 'zod';

import i18n from '../../../i18n/config';
import { apiInstance } from '../../../services/api';
import type { ActionNavigation } from '../../../services/crud/actions';
import { handleAxiosError } from '../../../services/crud/def';
import { MATIERE } from '../../structure/def';
import type { Ue } from '../../structure/entites/ue';
import { ENDPOINT_SYLLABUS_MATIERE, ENDPOINT_SYLLABUS_UE, SYLLABUS } from '../def';

/** Les bornes du serveur, en miroir : CHECK ≥ 0, et 999,99 pour NUMERIC(5,2). */
export const HEURES_MAX = 999.99;

/** Message zod paresseux sur un motif d'`errors.json` : la langue est lue à la validation. */
function motif(cle: 'valeur_negative' | 'valeur_hors_plage'): () => string {
    return () => i18n.t(`motifChamp.${cle}`, { ns: 'errors' });
}

const heures = z.number()
    .min(0, { error: motif('valeur_negative') })
    .max(HEURES_MAX, { error: motif('valeur_hors_plage') })
    .nullable();

const rubrique = z.string().nullable();

/** Les huit rubriques, dans l'ordre de la maquette. */
export const RUBRIQUES = [
    'contexte', 'objectifs', 'prerequis', 'activites', 'evaluation', 'plan_cours', 'ressources', 'dimension_socio_env',
] as const;

/** Les sept colonnes dont la somme fait le volume encadré ; `heures_perso` reste hors total. */
export const HEURES_ENCADREES = [
    'heures_cours', 'heures_cours_td', 'heures_td', 'heures_tp', 'heures_projet', 'heures_autonomie', 'heures_controle',
] as const;

/**
 * Les deux champs transitoires du responsable : le nom que `UserSelector`
 * affiche et recopie. Le serveur ne les connaît pas, ils sont retirés avant
 * le PUT.
 */
export const CHAMPS_NOM_RESPONSABLE = { prenom: 'responsable_prenom', nom: 'responsable_nom' } as const;

export const ficheMatiereSchema = z.object({
    id: z.number(),
    version: z.number(),
    matiere_id: z.number(),
    contexte: rubrique,
    objectifs: rubrique,
    prerequis: rubrique,
    activites: rubrique,
    evaluation: rubrique,
    plan_cours: rubrique,
    ressources: rubrique,
    dimension_socio_env: rubrique,
    heures_cours: heures,
    heures_cours_td: heures,
    heures_td: heures,
    heures_tp: heures,
    heures_projet: heures,
    heures_autonomie: heures,
    heures_controle: heures,
    heures_perso: heures,
    responsable_id: z.number().nullable(),
    responsable_prenom: z.string().optional(),
    responsable_nom: z.string().optional(),
});

export type FicheMatiereFormulaire = z.infer<typeof ficheMatiereSchema>;
/** La fiche telle que le serveur la lit et l'écrit : sans les champs transitoires. */
export type FicheMatiere = Omit<FicheMatiereFormulaire, 'responsable_prenom' | 'responsable_nom'>;

/** Le syllabus de l'UE : ce que la route syllabus écrit, et sa version. */
export const syllabusUeSchema = z.object({
    id: z.number(),
    version: z.number(),
    description: z.string().nullable(),
    responsable_id: z.number().nullable(),
    responsable_prenom: z.string().optional(),
    responsable_nom: z.string().optional(),
});

export type SyllabusUeFormulaire = z.infer<typeof syllabusUeSchema>;

/** Clé de la fiche d'une matière — le détail, il n'y a pas de liste. */
export function cleFicheMatiere(matiereId: string) {
    return [SYLLABUS, MATIERE, matiereId] as const;
}

/** Une rubrique vidée à l'écran est une rubrique absente : `null`, pas `''`. */
export function normaliserRubriques(fiche: FicheMatiere): FicheMatiere {
    const copie: FicheMatiere = { ...fiche };
    for (const cle of RUBRIQUES) {
        if (copie[cle] !== null && copie[cle].trim() === '') copie[cle] = null;
    }
    return copie;
}

export async function fetchFicheMatiere(matiereId: string): Promise<FicheMatiere> {
    try {
        const reponse = await apiInstance.get<FicheMatiere>(`${ENDPOINT_SYLLABUS_MATIERE}/${matiereId}`);
        return reponse.data;
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}

export async function enregistrerFicheMatiere(matiereId: string, fiche: FicheMatiere): Promise<FicheMatiere> {
    try {
        const reponse = await apiInstance.put<FicheMatiere>(`${ENDPOINT_SYLLABUS_MATIERE}/${matiereId}`, fiche);
        return reponse.data;
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}

export async function enregistrerSyllabusUe(
    ueId: string,
    syllabus: Pick<SyllabusUeFormulaire, 'version' | 'description' | 'responsable_id'>,
): Promise<Ue> {
    try {
        const reponse = await apiInstance.put<Ue>(`${ENDPOINT_SYLLABUS_UE}/${ueId}`, syllabus);
        return reponse.data;
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}

/**
 * L'action qui mène au syllabus d'une UE ou d'une matière : la même sur les
 * deux niveaux, le segment se pose sous l'identifiant de la ligne. Libellé en
 * fermeture — elle est créée au chargement des routes.
 */
export function ACTION_SYLLABUS(t?: TFunction<'syllabus'>): ActionNavigation<FieldValues> {
    const traduire = t ?? i18n.getFixedT(null, 'syllabus');
    return {
        id: 'syllabus',
        libelle: () => traduire('action'),
        icone: BookText,
        segment: SYLLABUS,
    };
}
