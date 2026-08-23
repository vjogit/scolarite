import { createRepository } from '../../services/crud/def';
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { z } from 'zod';
import { TextField, Typography } from "@mui/material";
import type { CrudProps, Datasource, RenderProps, ViewConfig } from "../../services/crud/def";
import type { MRT_ColumnDef } from 'material-react-table';
import { ENDPOINT_NOTE_PERIODE, NOTE } from './def';
import { NoteChartButton } from './NoteChartButton';
import { useNoteChart } from './useNoteChart';
import { NoteChartModal } from './NoteChartModal';
import { useRootPath } from '../../services/crud/useRootPath';
import { createNoteField } from './noteField';

const notePeriodeSchema = z.object({
    // Ce champ n'est pas une note mais un GPA : il s'exprime sur echelle_gpa
    // (0 à 4 ici), pas sur le barème. Aucune borne haute ne lui est applicable.
    // Il vaut null tant que le jury n'a pas délibéré : c'est le jury qui valide
    // un semestre, la période ne le recalcule pas.
    note: createNoteField(),
    /** false tant que l'élève n'est pas passé en jury pour cette période. */
    delibere: z.boolean(),
    user_id: z.number({
        message: "Veuillez sélectionner un élève"
    }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
});

export type NotePeriode = z.infer<typeof notePeriodeSchema>;

export const NotePeriodeFields = ({ register, errors, getValues }: RenderProps<NotePeriode>) => {
    return (
        <>
            <TextField
                label="Élève"
                // On affiche le nom complet récupéré par la requête SQL
                value={`${getValues("lastName") ?? ''} ${getValues("firstName") ?? ''}`}
                variant="outlined"
                fullWidth
                disabled
                sx={{ mb: 2 }}
            />
            <TextField
                {...register("note", { valueAsNumber: true })}
                label="GPA"
                variant="outlined"
                fullWidth
                type="number"
                disabled
                error={!!errors.note}
                helperText={errors.note?.message}
                slotProps={{ htmlInput: { step: "0.01" } }}
                sx={{ mb: 2 }}
            />
        </>
    );
};

const notePeriodeColumns: MRT_ColumnDef<NotePeriode>[] = [
    {
        accessorFn: (row) => `${row.lastName ?? ''} ${row.firstName ?? ''}`,
        header: 'Élève',
    },
    {
        accessorKey: 'note',
        header: 'GPA',
        // Une cellule vide confondrait deux situations distinctes : l'élève
        // n'est pas encore passé en jury, ou il l'est sans GPA calculable.
        // Seul le jury valide un semestre, l'attente est donc l'état normal
        // avant délibération et doit se lire comme tel.
        Cell: ({ row, cell }) => {
            if (!row.original.delibere) return 'Non délibéré';
            const valeur = cell.getValue<number | null>();
            return valeur != null ? valeur.toFixed(2) : '—';
        }
    },
]

const createNotePeriodeViewConfig = (periodeId: string): ViewConfig<NotePeriode> => {
    return {
        emptyValue: { periode_id: parseInt(periodeId) } as never,
        schema: notePeriodeSchema,
        columns: notePeriodeColumns,
        render: NotePeriodeFields,
    }
};

// Partie statique : à l'extérieur du composant
const createNotePeriodeRepository = (periodeId: string) => {
    return createRepository<NotePeriode>({
        endpoint: ENDPOINT_NOTE_PERIODE,
        queryParams: `?periode_id=${periodeId}`,
        queryKey: [NOTE, 'periode', periodeId],
        getId: (data: NotePeriode) => data.user_id,
    })
}

export function CrudNotePeriode({ mode, workflow, isAction, isTopToolbar, actionsLigne }: CrudProps<NotePeriode>) {

    const { periodeId } = useParams();
    const rootPath = useRootPath(mode);
    const { chartOpen, setChartOpen, chartData, handleOpenChart } = useNoteChart<NotePeriode>();

    const datasource = useMemo((): Datasource<NotePeriode> | null => periodeId ? ({
        ...createNotePeriodeRepository(periodeId),
        ...createNotePeriodeViewConfig(periodeId),
        // « GPA délibéré » et non « Notes de la période » : cet axe n'est pas
        // de même nature que ceux de matière et d'UE. Il ne montre pas une note
        // calculée depuis les copies mais le relevé arrêté par le jury, seul
        // habilité à valider un semestre. Le titre le dit plutôt que de le
        // laisser deviner à celui qui lit une colonne « Non délibéré ».
        title: "GPA délibéré",
        entityLabel: "le GPA délibéré",
        entityLabelPlural: "GPA délibérés",
        isAction,
        actionsLigne,
        isTopToolbar,
        renderTopToolbarCustomActions: ({ table }) => (
            <NoteChartButton onClick={() => { handleOpenChart(table); }} />
        )
    }) : null, [periodeId, isAction, isTopToolbar, actionsLigne, handleOpenChart]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre ueId est obligatoire</Typography>
    )


    return (
        <>
            <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
            <NoteChartModal open={chartOpen} onClose={() => { setChartOpen(false); }} data={chartData} />
        </>
    )
}