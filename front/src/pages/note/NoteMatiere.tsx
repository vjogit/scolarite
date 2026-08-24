/**
 * Axe Matière : la moyenne de chaque élève pour une matière.
 *
 * Écran de consultation. `note_read_matiere.sql` part de `note` jointe par
 * `controle_id` — la table n'a aucune autre clé de rattachement — et applique
 * les règles de la promotion. Rien de ce qui s'affiche ici n'existe en base.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Alert } from '@mui/material';
import type { MRT_ColumnDef } from 'material-react-table';

import type { DatasourceListe } from '../../services/crud/def';
import { AXE_MATIERE } from './axes';
import { AxeCalcule } from './AxeCalcule';
import { CelluleNoteCalculee } from './CelluleNote';
import {
    createNoteMatiereRepository, nomEleve, noteMatiereEntite, type NoteMatiere,
} from './entites/noteMatiere';

const colonnes: MRT_ColumnDef<NoteMatiere>[] = [
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
];

export function AxeNoteMatiere() {
    const { matiereId } = useParams();

    const datasource = useMemo((): DatasourceListe<NoteMatiere> | null => matiereId ? ({
        ...createNoteMatiereRepository(matiereId),
        ...noteMatiereEntite,
        columns: colonnes,
        // Aucune action de ligne : « Voir » et « Éditer » que la liste ajoute
        // mèneraient aux routes de formulaire que cet axe n'a plus.
        isAction: false,
        isTopToolbar: true,
    }) : null, [matiereId]);

    if (!datasource) return <Alert severity="error">Le paramètre matiereId est obligatoire.</Alert>;

    return <AxeCalcule datasource={datasource} axe={AXE_MATIERE} />;
}
