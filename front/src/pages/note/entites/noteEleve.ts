/**
 * Le relevé d'un élève : ses notes de contrôle et ses GPA, par période.
 *
 * Deux lectures distinctes du même axe, sous des clés qui suivent la
 * convention du domaine — `[espace, entité, parent]` — plutôt que les
 * `['notes-eleve', id]` qui vivaient dans le composant.
 *
 * Ni l'une ni l'autre n'est filtrée par la période : le serveur rend le dossier
 * complet, et l'écran le groupe. C'est ce qui permet de comparer deux semestres
 * sans changer d'URL, et ce qui rend le contexte de période utile sans être
 * nécessaire — il choisit l'onglet ouvert, il ne restreint pas la lecture.
 */

import { apiInstance } from '../../../services/api';
import { ENDPOINT_NOTE, NOTE, ELEVE } from '../def';

/** Une note de contrôle, aplatie avec toute sa chaîne de rattachement. */
export interface NoteEleveLigne {
    id: number;
    /** Colonne `real` nullable → `*float32` : nombre JSON ou `null`. */
    note: number | null;
    remarque: string | null;
    is_validated: boolean;
    not_evaluated: boolean;
    controle_id: number;
    controle_name: string;
    controle_coeff: number;
    is_rattrapage: boolean;
    matiere_id: number;
    matiere_name: string;
    unite_enseignement_id: number;
    unite_enseignement_name: string;
    unite_enseignement_ects: number;
    periode_id: number;
    periode_name: string;
}

export interface GpaPeriode {
    periode_id: number;
    periode_name: string;
    /**
     * Nullable pour de bon : le dénominateur est un `NULLIF`. Le serveur les
     * caste désormais en `my_null_float`, faute de quoi pgx échouait au scan
     * d'un `NULL` et l'écran recevait un 500 au lieu d'une absence de valeur.
     */
    gpa_periode: number | null;
    gpa_academique_periode: number | null;
}

export const cleNotesEleve = (userId: string) => [NOTE, ELEVE, userId] as const;
export const cleGpaEleve = (userId: string) => [NOTE, ELEVE, userId, 'gpa'] as const;

export const lireNotesEleve = (userId: string) => async (): Promise<NoteEleveLigne[]> => {
    const reponse = await apiInstance.get<NoteEleveLigne[]>(`${ENDPOINT_NOTE}/eleve?user_id=${userId}`);
    return reponse.data;
};

export const lireGpaEleve = (userId: string) => async (): Promise<GpaPeriode[]> => {
    const reponse = await apiInstance.get<GpaPeriode[]>(`${ENDPOINT_NOTE}/eleve/gpa?user_id=${userId}`);
    return reponse.data;
};
