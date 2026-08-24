/**
 * Axe UE : la moyenne de chaque élève pour une unité d'enseignement, son grade
 * et le verdict d'élimination.
 *
 * Écran de consultation, calculé par `note_read_ue.sql` depuis les moyennes de
 * matière — elles-mêmes calculées depuis les notes de contrôle.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Alert } from '@mui/material';
import type { MRT_ColumnDef } from 'material-react-table';

import type { DatasourceListe } from '../../services/crud/def';
import { AXE_UE } from './axes';
import { AxeCalcule } from './AxeCalcule';
import { CelluleNoteCalculee } from './CelluleNote';
import { nomEleve } from './entites/noteMatiere';
import { createNoteUeRepository, noteUeEntite, type NoteUe } from './entites/noteUe';

/**
 * Trois états et non deux. `a_matiere_eliminatoire` est `NULL` quand l'UE n'est
 * pas évaluée, et la requête dit pourquoi : sans moyenne complète, on ne sait
 * pas si une matière est éliminatoire. L'écran rendait ce `NULL` comme un `-`,
 * c'est-à-dire comme le « non » que le serveur refuse d'affirmer.
 */
function eliminatoire(ligne: NoteUe): string {
    if (ligne.a_matiere_eliminatoire === null) return 'Indéterminé';
    return ligne.a_matiere_eliminatoire ? 'Oui' : 'Non';
}

const colonnes: MRT_ColumnDef<NoteUe>[] = [
    { accessorFn: nomEleve, id: 'eleve', header: 'Élève' },
    {
        accessorKey: 'note',
        header: 'Moyenne',
        Cell: ({ cell, row }) => (
            <CelluleNoteCalculee
                valeur={cell.getValue<number | null>()}
                provenance={row.original.provenance}
            />
        ),
    },
    { accessorKey: 'grade_lettre', header: 'Grade' },
    { accessorFn: eliminatoire, id: 'eliminatoire', header: 'Matière éliminatoire' },
];

export function AxeNoteUniteEnseignement() {
    const { ueId } = useParams();

    const datasource = useMemo((): DatasourceListe<NoteUe> | null => ueId ? ({
        ...createNoteUeRepository(ueId),
        ...noteUeEntite,
        columns: colonnes,
        isAction: false,
        isTopToolbar: true,
    }) : null, [ueId]);

    if (!datasource) return <Alert severity="error">Le paramètre ueId est obligatoire.</Alert>;

    return <AxeCalcule datasource={datasource} axe={AXE_UE} />;
}
