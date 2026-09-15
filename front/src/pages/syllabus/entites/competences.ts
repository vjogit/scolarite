/**
 * Ce qu'est le référentiel de compétences d'une formation (lot 3),
 * indépendamment des écrans qui l'affichent : le bloc, la compétence, le
 * référentiel à plat que la matrice de l'UE lit, la matrice elle-même, et les
 * actions qui y mènent.
 *
 * Décisions tranchées : le référentiel est par formation (fiche RNCP) ; l'ordre
 * est une position saisie, unique par parent, et le code « C{ordre} » se
 * calcule ici, jamais stocké ; la matrice de l'UE est trois booléens par
 * compétence, écrite par remplacement intégral sans verrou — dernier écrit
 * gagne ; le serveur garantit qu'une UE ne se lie qu'aux compétences de sa
 * formation (motif `hors_formation`), l'écran ne propose que celles-là.
 */

import { ListChecks } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { FieldValues } from 'react-hook-form';
import { z } from 'zod';

import i18n from '../../../i18n/config';
import { messageValidation } from '../../../i18n/validation';
import { apiInstance } from '../../../services/api';
import type { ActionNavigation } from '../../../services/crud/actions';
import { createRepository, handleAxiosError, type DescriptionEntite } from '../../../services/crud/def';
import { FORMATION } from '../../structure/def';
import { Role } from '../../user/def';
import {
    BLOC, COMPETENCE, ENDPOINT_BLOC, ENDPOINT_BLOC_DELETE_IMPACT, ENDPOINT_COMPETENCE,
    ENDPOINT_COMPETENCE_DELETE_IMPACT, ENDPOINT_SYLLABUS_UE, SYLLABUS,
} from '../def';

function tSyllabus(t?: TFunction<'syllabus'>): TFunction<'syllabus'> {
    return t ?? i18n.getFixedT(null, 'syllabus');
}

/** Une position : entier strictement positif, comme le CHECK nommé du serveur. */
const ordre = z.number({ error: messageValidation('ordreRequis') })
    .int({ error: messageValidation('ordreRequis') })
    .min(1, { error: messageValidation('ordreRequis') });

const texteOptionnel = z.string().nullable();

export const blocSchema = z.object({
    id: z.number(),
    version: z.number(),
    formation_id: z.number(),
    ordre,
    libelle: z.string().min(1, { error: messageValidation('libelleRequis') }),
    code: texteOptionnel,
    activites: texteOptionnel,
    modalites_evaluation: texteOptionnel,
});

export type Bloc = z.infer<typeof blocSchema>;

export const competenceSchema = z.object({
    id: z.number(),
    version: z.number(),
    bloc_id: z.number(),
    ordre,
    action: z.string().min(1, { error: messageValidation('actionRequise') }),
    contexte: texteOptionnel,
    finalites: texteOptionnel,
});

export type Competence = z.infer<typeof competenceSchema>;

/** Le code affiché d'une compétence, dérivé de sa position : « C1 », « C2 »… */
export function codeCompetence(ordre: number): string {
    return `C${String(ordre)}`;
}

/** Le libellé d'un bloc en tête de sa section : son code officiel s'il en a un, puis son libellé. */
export function libelleBloc(bloc: { code: string | null; libelle: string }): string {
    return bloc.code !== null && bloc.code.trim() !== '' ? `${bloc.code} — ${bloc.libelle}` : bloc.libelle;
}

export const createBlocRepository = (formationId: string) => createRepository<Bloc>({
    endpoint: ENDPOINT_BLOC,
    deleteImpactEndpoint: ENDPOINT_BLOC_DELETE_IMPACT,
    queryParams: `?formation_id=${formationId}`,
    queryKey: [SYLLABUS, BLOC, formationId],
    getId: (data) => data.id,
    getName: (data) => data.libelle,
});

export const createCompetenceRepository = (blocId: string) => createRepository<Competence>({
    endpoint: ENDPOINT_COMPETENCE,
    deleteImpactEndpoint: ENDPOINT_COMPETENCE_DELETE_IMPACT,
    queryParams: `?bloc_id=${blocId}`,
    queryKey: [SYLLABUS, COMPETENCE, blocId],
    getId: (data) => data.id,
    getName: (data) => data.action,
});

export function blocEntite(t?: TFunction<'syllabus'>): DescriptionEntite {
    const traduire = tSyllabus(t);
    return {
        title: traduire('competences.bloc.title'),
        roleEcriture: Role.SYLLABUS_ECRITURE,
        entityLabel: traduire('competences.bloc.nom'),
        entityLabelAvecArticle: traduire('competences.bloc.nomAvecArticle'),
        entityLabelPlural: traduire('competences.bloc.nomPluriel'),
        entityGender: 'm',
    };
}

export function competenceEntite(t?: TFunction<'syllabus'>): DescriptionEntite {
    const traduire = tSyllabus(t);
    return {
        title: traduire('competences.competence.title'),
        roleEcriture: Role.SYLLABUS_ECRITURE,
        entityLabel: traduire('competences.competence.nom'),
        entityLabelAvecArticle: traduire('competences.competence.nomAvecArticle'),
        entityLabelPlural: traduire('competences.competence.nomPluriel'),
        entityGender: 'f',
    };
}

/**
 * Descente de la formation vers son référentiel. Libellé en fermeture : le
 * bandeau de la structure crée ses actions au chargement du module.
 */
export function ACTION_REFERENTIEL(t?: TFunction<'syllabus'>): ActionNavigation<FieldValues> {
    const traduire = tSyllabus(t);
    return {
        id: 'referentiel',
        libelle: () => traduire('competences.action'),
        icone: ListChecks,
        segment: BLOC,
    };
}

/** Descente du bloc vers ses compétences. */
export function ACTION_COMPETENCES(t?: TFunction<'syllabus'>): ActionNavigation<FieldValues> {
    const traduire = tSyllabus(t);
    return {
        id: 'competences',
        libelle: () => traduire('competences.bloc.gererCompetences'),
        icone: ListChecks,
        segment: COMPETENCE,
    };
}

// ── Le référentiel à plat et la matrice de l'UE ──────────────────────────

/** Une compétence portant son bloc : la ligne du référentiel à plat. */
export interface LigneReferentiel {
    id: number;
    version: number;
    bloc_id: number;
    ordre: number;
    action: string;
    contexte: string | null;
    finalites: string | null;
    bloc_ordre: number;
    bloc_libelle: string;
    bloc_code: string | null;
}

/** Une liaison UE ↔ compétence : au moins un des trois axes est vrai. */
export interface LiaisonCompetence {
    ue_id: number;
    competence_id: number;
    enseignee: boolean;
    mise_en_oeuvre: boolean;
    evaluee: boolean;
}

/** Les trois axes, dans l'ordre des colonnes de la maquette. */
export const AXES = ['enseignee', 'mise_en_oeuvre', 'evaluee'] as const;
export type Axe = typeof AXES[number];

/** Clé du référentiel à plat : une collection à part, filtrée par formation. */
export function cleReferentiel(formationId: string) {
    return [SYLLABUS, COMPETENCE, FORMATION, formationId] as const;
}

/** Clé de la matrice d'une UE. */
export function cleMatrice(ueId: string) {
    return [SYLLABUS, 'matrice', ueId] as const;
}

export async function fetchReferentiel(formationId: string): Promise<LigneReferentiel[]> {
    try {
        const reponse = await apiInstance.get<LigneReferentiel[]>(`${ENDPOINT_COMPETENCE}?formation_id=${formationId}`);
        return reponse.data;
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}

export async function fetchMatrice(ueId: string): Promise<LiaisonCompetence[]> {
    try {
        const reponse = await apiInstance.get<LiaisonCompetence[]>(`${ENDPOINT_SYLLABUS_UE}/${ueId}/competences`);
        return reponse.data;
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}

/** Remplacement intégral : le serveur renvoie la matrice relue, dans l'ordre du référentiel. */
export async function enregistrerMatrice(
    ueId: string,
    lignes: Omit<LiaisonCompetence, 'ue_id'>[],
): Promise<LiaisonCompetence[]> {
    try {
        const reponse = await apiInstance.put<LiaisonCompetence[]>(`${ENDPOINT_SYLLABUS_UE}/${ueId}/competences`, lignes);
        return reponse.data;
    } catch (erreur: unknown) {
        throw handleAxiosError(erreur);
    }
}
