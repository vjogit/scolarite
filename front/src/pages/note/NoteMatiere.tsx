import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { z } from 'zod';
import { TextField, Typography } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import type { MRT_ColumnDef } from 'material-react-table';
import { NoteChartModal } from './NoteChartModal';
import { ENDPOINT_NOTE_MATIERE, NOTE } from './def';
import { NoteChartButton, useNoteChart } from './NoteChartButton';
import { useRootPath } from '../../services/crud/useRootPath';

export const noteMatiereSchema = z.object({
    id: z.number(),
    version: z.number(),
    note: z.number().min(0, "La note doit être positive").nullable().optional(),
    matiere_id: z.number(),
    user_id: z.number({
        message: "Veuillez sélectionner un élève"
    }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
})

export type NoteMatiere = z.infer<typeof noteMatiereSchema>;

export const NoteMatiereFields = ({ register, errors, getValues }: RenderProps<NoteMatiere>) => {

    return (
        <>
            <TextField
                label="Élève"
                // On affiche le nom complet récupéré par la requête SQL
                value={`${getValues("lastName") || ''} ${getValues("firstName") || ''}`}
                variant="outlined"
                fullWidth
                disabled
                sx={{ mb: 2 }}
            />
            <TextField
                {...register("note", { valueAsNumber: true })}
                label="Note"
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

const noteMatiereColumns: MRT_ColumnDef<NoteMatiere>[] = [
    {
        accessorFn: (row) => `${row.lastName || ''} ${row.firstName || ''}`,
        header: 'Élève',
    },
    {
        accessorKey: 'note',
        header: 'Note',
        // On personnalise uniquement le rendu visuel de la cellule
        Cell: ({ cell }) => {
            const valeur = cell.getValue<number | null>();
            return valeur != null ? valeur.toFixed(2) : 'N.E.';
        }
    },
]

export const createNoteMatiereViewConfig = (matiereId: string): ViewConfig<NoteMatiere> => {
    return {
        schema: noteMatiereSchema,
        emptyValue: { id: -1, version: -1, matiere_id: parseInt(matiereId) },
        columns: noteMatiereColumns,
        render: NoteMatiereFields,
    }
};
export const createNoteMatiereRepository = (matiereId: string) => {
    return createRepository<NoteMatiere>({
        endpoint: `${ENDPOINT_NOTE_MATIERE}`,
        queryParams: `?matiere_id=${matiereId}`,
        queryKey: [NOTE, 'matiere', matiereId],
        getId: (data: NoteMatiere) => data.id
    })
}
export function CrudNoteMatiere({ mode, workflow, isAction, isTopToolbar, renderRowActions }: CrudProps<NoteMatiere>) {

    const { matiereId } = useParams();
    const { chartOpen, setChartOpen, chartData, handleOpenChart } = useNoteChart<NoteMatiere>();
    const rootPath = useRootPath(mode);

    if (!matiereId) return (
        <Typography>Le paramètre matiereId est obligatoire</Typography>
    )

    const datasource = useMemo((): Datasource<NoteMatiere> => ({
        ...createNoteMatiereRepository(matiereId),
        ...createNoteMatiereViewConfig(matiereId),
        title: "Notes de la matière",
        isAction,
        renderRowActions,
        isTopToolbar,
        renderTopToolbarCustomActions: ({ table }) => (
            <NoteChartButton onClick={() => handleOpenChart(table)} />
        )
    }), []);


    return (
        <>
            <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
            <NoteChartModal open={chartOpen} onClose={() => setChartOpen(false)} data={chartData} />
        </>
    )
}