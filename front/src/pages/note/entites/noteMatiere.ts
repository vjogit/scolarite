/**
 * La moyenne d'une matière, telle que le serveur la calcule.
 *
 * Une interface et non un schéma zod : `createRepository.fetchAll` transtype la
 * réponse sans jamais la valider, et l'axe n'a plus de formulaire à qui donner
 * un schéma. Un `z.object` ici n'aurait validé rien du tout tout en affirmant
 * le contraire — c'est ce qu'il faisait.
 *
 * Aucune écriture : `routes.go` n'expose de verbe qu'au niveau du contrôle, et
 * l'absence de `roleEcriture` suffit à ce que `useDroits.peutEcrire` refuse.
 */

import type { TFunction } from 'i18next';
import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { tCrud } from '../../../services/crud/entityMessages';
import { ENDPOINT_NOTE_MATIERE, NOTE } from '../def';
import type { Provenance } from '../provenance';

export interface NoteMatiere {
    user_id: number;
    /** `*string` côté Go : le serveur peut ne rien avoir à nommer. */
    firstName: string | null;
    lastName: string | null;
    matiere_id: number;
    matiere_name: string;
    /** `my_null_float` → `*float64` → nombre JSON ou `null`. */
    note: number | null;
    provenance: Provenance;
}

export const createNoteMatiereRepository = (matiereId: string) =>
    createRepository<NoteMatiere>({
        endpoint: ENDPOINT_NOTE_MATIERE,
        queryParams: `?matiere_id=${matiereId}`,
        queryKey: [NOTE, 'matiere', matiereId],
        // La ligne n'est pas une note mais un élève et sa moyenne : la clé de
        // ligne est donc l'élève. L'ancien `data.id` désignait un identifiant
        // que cette requête ne renvoie pas.
        getId: (data: NoteMatiere) => data.user_id,
        getName: (data: NoteMatiere) => nomEleve(data),
    });

/** Nom affichable d'un élève, commun aux trois axes calculés. */
export function nomEleve(ligne: { firstName: string | null; lastName: string | null }): string {
    return `${ligne.lastName ?? ''} ${ligne.firstName ?? ''}`.trim();
}

export function noteMatiereEntite(t?: TFunction<'crud'>): DescriptionEntite {
    const traduire = tCrud(t);
    return {
        title: traduire('entites.noteMatiere.title', { ns: 'crud' }),
        entityLabel: traduire('entites.noteMatiere.nom', { ns: 'crud' }),
        entityLabelAvecArticle: traduire('entites.noteMatiere.nomAvecArticle', { ns: 'crud' }),
        entityLabelPlural: traduire('entites.noteMatiere.nomPluriel', { ns: 'crud' }),
        entityGender: 'f',
    };
}
