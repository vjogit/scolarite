import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { z } from 'zod';
import { TextField, Typography } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import type { MRT_ColumnDef } from 'material-react-table';
import { NoteChartModal } from './NoteChartModal';
import { ENDPOINT_NOTE_UE, NOTE } from './def';
import { NoteChartButton, useNoteChart } from './NoteChartButton';
import { useRootPath } from '../../services/crud/useRootPath';
import { createNoteField } from './noteField';

const noteUeSchema = z.object({

    // Moyenne d'UE : même unité que les notes, mais champ en lecture seule et
    // barème non chargé par cet écran.
    note: createNoteField(),
    a_matiere_eliminatoire: z.boolean(),
    grade_lettre: z.string(),
    unite_enseignement_id: z.number(),
    user_id: z.number({
        message: "Veuillez sélectionner un élève"
    }),
    firstName: z.string(),
    lastName: z.string(),
})

type NoteUe = z.infer<typeof noteUeSchema>;

export const NoteUeFields = ({ register, errors, getValues }: RenderProps<NoteUe>) => {
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

const noteUeColumns: MRT_ColumnDef<NoteUe>[] = [
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
    { accessorKey: 'grade_lettre', header: 'Grade' },
    { accessorFn: (data) => data.a_matiere_eliminatoire ? 'Oui' : '-', header: 'Matière éliminatoire' },
]

export const createNoteUeViewConfig = (ueId: string): ViewConfig<NoteUe> => {
    return {
        schema: noteUeSchema,
        emptyValue: { unite_enseignement_id: parseInt(ueId) },
        columns: noteUeColumns,
        render: NoteUeFields,
    }
};

// Partie statique : à l'extérieur du composant
const createNoteUeRepository = (ueId: string) => {
    return createRepository<NoteUe>({
        endpoint: `${ENDPOINT_NOTE_UE}`,
        queryParams: `?unite_enseignement_id=${ueId}`,
        queryKey: [NOTE, 'ue', ueId],
        getId: () => -1,
    })
}

export function CrudNoteUniteEnseignement({ mode, workflow, isAction, isTopToolbar, actionsLigne }: CrudProps<NoteUe>) {

    const { ueId } = useParams();
    const rootPath = useRootPath(mode);
    const { chartOpen, setChartOpen, chartData, handleOpenChart } = useNoteChart<NoteUe>();


    if (!ueId) return (
        <Typography>Le paramètre ueId est obligatoire</Typography>
    )

    const datasource = useMemo((): Datasource<NoteUe> => ({
        ...createNoteUeRepository(ueId),
        ...createNoteUeViewConfig(ueId),
        title: "Notes de l'UE",
        entityLabel: "la note",
        entityLabelPlural: "notes",
        isAction,
        actionsLigne,
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
