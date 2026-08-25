/**
 * Le GPA d'une période, tel que le jury l'a arrêté.
 *
 * Cet axe n'est pas de même nature que la matière et l'UE : il ne montre pas
 * une moyenne recalculée depuis les copies mais le relevé figé par la
 * délibération — c'est le jury qui valide un semestre. D'où l'absence de
 * `provenance`, remplacée par `delibere` : « pas encore passé en jury » et
 * « non évalué » sont deux états distincts, et le `NULL` ne permet pas de les
 * départager.
 *
 * L'effectif que cette requête rapporte — les élèves ayant au moins une note
 * dans la période — sert aussi de dépôt de frères à l'axe Élève. La même clé de
 * requête, donc la même entrée de cache : le sélecteur pré-filtré ne coûte
 * aucun appel de plus quand cet axe a déjà été affiché.
 */

import type { TFunction } from 'i18next';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { ENDPOINT_NOTE_PERIODE, NOTE } from '../def';
import { nomEleve } from './noteMatiere';

export interface NotePeriode {
    user_id: number;
    firstName: string | null;
    lastName: string | null;
    /** GPA sur `echelle_gpa`, pas sur le barème. `null` sans délibération. */
    note: number | null;
    /** `false` tant que l'élève n'est pas passé en jury pour cette période. */
    delibere: boolean;
}

export const createNotePeriodeRepository = (periodeId: string) =>
    createRepository<NotePeriode>({
        endpoint: ENDPOINT_NOTE_PERIODE,
        queryParams: `?periode_id=${periodeId}`,
        queryKey: [NOTE, 'periode', periodeId],
        getId: (data: NotePeriode) => data.user_id,
        getName: (data: NotePeriode) => nomEleve(data),
    });

export function notePeriodeEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.notePeriode.title', { ns: 'crud' }),
        entityLabel: traduire('entites.notePeriode.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.notePeriode.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.notePeriode.nomPluriel', { ns: 'crud' }),
    };
}
