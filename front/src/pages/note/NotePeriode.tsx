import { createRepository } from '../../services/crud/def';
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { z } from 'zod';
import { TextField, Typography } from "@mui/material";
import type { CrudProps, Datasource, RenderProps, ViewConfig } from "../../services/crud/def";
import type { MRT_ColumnDef } from 'material-react-table';
import { ENDPOINT_NOTE_PERIODE, NOTE } from './def';
import { NoteChartButton, useNoteChart } from './NoteChartButton';
import { NoteChartModal } from './NoteChartModal';
import { useRootPath } from '../../services/crud/useRootPath';

export const notePeriodeSchema = z.object({
    id: z.number(),
    version: z.number(),
    note: z.number().min(0, "La note doit être positive").nullable().optional(),
    remarque: z.string().nullish(),
    controle_id: z.number().optional(),
    matiere_id: z.number().optional(),
    unite_enseignement_id: z.number().optional(),
    periode_id: z.number().optional(),
    user_id: z.number({
        message: "Veuillez sélectionner un élève"
    }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
}).refine(data => {
    const fkCount = [data.controle_id, data.matiere_id, data.unite_enseignement_id, data.periode_id].filter(v => v != null).length;
    return fkCount === 1;
}, {
    message: "Une note doit être associée à exactement un élément (contrôle, matière, UE, ou période).",
    path: ["user_id"], // Attach error to a visible field
});

export type NotePeriode = z.infer<typeof notePeriodeSchema>;

export const NotePeriodeFields = ({ register, errors, getValues }: RenderProps<NotePeriode>) => {
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
                label="Gpa"
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
        accessorFn: (row) => `${row.lastName || ''} ${row.firstName || ''}`,
        header: 'Élève',
    },
    {
        accessorKey: 'note',
        header: 'Gpa',
        // On personnalise uniquement le rendu visuel de la cellule
        Cell: ({ cell }) => {
            const valeur = cell.getValue<number | null>();
            return valeur != null ? valeur.toFixed(2) : 'N.E.';
        }
    },
]

export const createNotePeriodeViewConfig = (periodeId: string): ViewConfig<NotePeriode> => {
    return {
        emptyValue: { id: -1, version: -1, periode_id: parseInt(periodeId) },
        schema: notePeriodeSchema,
        columns: notePeriodeColumns,
        render: NotePeriodeFields,
    }
};

// Partie statique : à l'extérieur du composant
export const createNotePeriodeRepository = (periodeId: string) => {
    return createRepository<NotePeriode>({
        endpoint: `${ENDPOINT_NOTE_PERIODE}`,
        queryParams: `?periode_id=${periodeId}`,
        queryKey: [NOTE, 'periode', periodeId],
        getId: (data: NotePeriode) => data.id,
    })
}

export function CrudNotePeriode({ mode, workflow, isAction, isTopToolbar, renderRowActions }: CrudProps<NotePeriode>) {

    const { periodeId } = useParams();
    const rootPath = useRootPath(mode);
    const { chartOpen, setChartOpen, chartData, handleOpenChart } = useNoteChart<NotePeriode>();


    if (!periodeId) return (
        <Typography>Le paramètre ueId est obligatoire</Typography>
    )

    const datasource = useMemo((): Datasource<NotePeriode> => ({
        ...createNotePeriodeRepository(periodeId),
        ...createNotePeriodeViewConfig(periodeId),
        title: "Notes de la période",
        isAction,
        renderRowActions,
        isTopToolbar,
        renderTopToolbarCustomActions: ({ table }) => (
            <NoteChartButton onClick={() => handleOpenChart(table)} />
        )
    }), [periodeId, isAction, isTopToolbar, renderRowActions, handleOpenChart]);


    return (
        <>
            <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
            <NoteChartModal open={chartOpen} onClose={() => setChartOpen(false)} data={chartData} />
        </>
    )
}