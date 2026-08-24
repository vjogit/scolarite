/**
 * Axe Période : le GPA de chaque élève, tel que le jury l'a arrêté.
 *
 * Cet axe n'est pas de même nature que la matière et l'UE. Il ne recalcule
 * rien depuis les copies : il lit `jury_result`, le relevé figé par la
 * délibération. C'est le jury qui valide un semestre, et « pas encore
 * délibéré » est l'état normal avant qu'il se prononce.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Alert, Typography } from '@mui/material';
import type { MRT_ColumnDef } from 'material-react-table';

import type { DatasourceListe } from '../../services/crud/def';
import { AXE_PERIODE } from './axes';
import { AxeCalcule } from './AxeCalcule';
import { nomEleve } from './entites/noteMatiere';
import { createNotePeriodeRepository, notePeriodeEntite, type NotePeriode } from './entites/notePeriode';
import { formatNote } from './provenance';

/** Discret : c'est une absence, elle ne doit pas peser autant qu'une valeur. */
function Absence({ children }: { children: string }) {
    return (
        <Typography component="span" variant="body2" color="text.secondary">
            {children}
        </Typography>
    );
}

const colonnes: MRT_ColumnDef<NotePeriode>[] = [
    { accessorFn: nomEleve, id: 'eleve', header: 'Élève' },
    {
        accessorKey: 'note',
        header: 'GPA',
        // Trois situations qu'une cellule vide confondrait : l'élève n'est pas
        // passé en jury, il l'est sans GPA calculable, il en a un.
        Cell: ({ cell, row }) => {
            if (!row.original.delibere) return <Absence>Non délibéré</Absence>;
            const valeur = cell.getValue<number | null>();
            if (valeur == null) return <Absence>GPA non calculable</Absence>;
            return <>{formatNote.format(valeur)}</>;
        },
    },
];

export function AxeNotePeriode() {
    const { periodeId } = useParams();

    const datasource = useMemo((): DatasourceListe<NotePeriode> | null => periodeId ? ({
        ...createNotePeriodeRepository(periodeId),
        ...notePeriodeEntite,
        columns: colonnes,
        isAction: false,
        isTopToolbar: true,
    }) : null, [periodeId]);

    if (!datasource) return <Alert severity="error">Le paramètre periodeId est obligatoire.</Alert>;

    return <AxeCalcule datasource={datasource} axe={AXE_PERIODE} />;
}
