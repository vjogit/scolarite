/**
 * La moyenne d'une unité d'enseignement, telle que le serveur la calcule.
 *
 * Même raisonnement que `noteMatiere.ts` : interface plutôt que schéma, aucune
 * écriture. Une nuance propre à cet axe : `a_matiere_eliminatoire` est
 * nullable. `note_read_ue.sql` le dit explicitement — sans moyenne complète,
 * on ne sait pas si une matière est éliminatoire, et `BOOL_OR` concluait
 * « non », « une affirmation qu'on ne peut pas soutenir ». Le front la
 * déclarait `z.boolean()` et rendait `null` comme un `-`, c'est-à-dire comme
 * ce « non » que la requête refuse.
 */

import { createRepository, type DescriptionEntite } from '../../../services/crud/def';
import { ENDPOINT_NOTE_UE, NOTE } from '../def';
import type { Provenance } from '../provenance';
import { nomEleve } from './noteMatiere';

export interface NoteUe {
    user_id: number;
    firstName: string | null;
    lastName: string | null;
    note: number | null;
    /** `my_null_bool` → `*bool` : `null` quand l'UE n'est pas évaluée. */
    a_matiere_eliminatoire: boolean | null;
    grade_lettre: string;
    provenance: Provenance;
}

export const createNoteUeRepository = (ueId: string) =>
    createRepository<NoteUe>({
        endpoint: ENDPOINT_NOTE_UE,
        queryParams: `?unite_enseignement_id=${ueId}`,
        queryKey: [NOTE, 'ue', ueId],
        // L'ancien `getId: () => -1` donnait la même clé à toutes les lignes.
        getId: (data: NoteUe) => data.user_id,
        getName: (data: NoteUe) => nomEleve(data),
    });

export const noteUeEntite: DescriptionEntite = {
    title: "Moyennes de l'UE",
    entityLabel: "la moyenne",
    entityLabelPlural: "moyennes",
};
