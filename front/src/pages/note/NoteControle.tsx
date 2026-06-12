import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { z } from 'zod';
import { useWatch } from 'react-hook-form';
import { TextField, FormControlLabel, Switch, Typography, Box } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import { Controller } from 'react-hook-form';
import type { MRT_Cell, MRT_ColumnDef } from 'material-react-table';
import { NoteChartModal } from './NoteChartModal';
import { ENDPOINT_CONTROLE, ENDPOINT_NOTE_CONTROLE, NOTE } from './def';
import { UserSelector } from '../../services/UserSelector';
import { NoteChartButton, useNoteChart } from './NoteChartButton';
import { useRootPath } from '../../services/crud/useRootPath';
import { useQuery } from '@tanstack/react-query';
import { apiInstance } from '../../services/api';
import type { Controle } from './Controle';

const noteControleSchema = z.object({
    id: z.number(),
    version: z.number(),
    note: z.number().min(0, "La note doit être positive").nullable().optional(),
    remarque: z.string().nullish(),
    is_validated: z.boolean().default(false),
    not_evaluated: z.boolean().default(false),
    controle_id: z.number(),
    user_id: z.number({
        message: "Veuillez sélectionner un élève"
    }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
}).refine(data => {
    const fkCount = [data.controle_id].filter(v => v != null).length;
    return fkCount === 1;
}, {
    message: "Une note doit être associée à exactement un élément (contrôle, matière, UE, ou période).",
    path: ["user_id"],
}).refine(data => {
    if (!data.not_evaluated && (data.note == null || isNaN(data.note))) return false;
    return true;
}, {
    message: "La note est obligatoire",
    path: ["note"],
});

export type NoteControle = z.infer<typeof noteControleSchema>;

const createNoteMatiereFields = (isRattrapage: boolean) =>
    ({ register, control, errors, isReadOnly, getValues, setValue }: RenderProps<NoteControle>) => {
        const notEvaluated = useWatch({ control, name: 'not_evaluated' });
        return (
            <>
                <UserSelector
                    control={control}
                    errors={errors}
                    getValues={getValues}
                    setValue={setValue}
                    isReadOnly={isReadOnly}
                />

                <FormControlLabel
                    control={
                        <Controller
                            name="not_evaluated"
                            control={control}
                            render={({ field }) => (
                                <Switch
                                    {...field}
                                    checked={field.value}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                        field.onChange(e);
                                        if (e.target.checked) setValue('note', null);
                                    }}
                                />
                            )}
                        />
                    }
                    label="Non évalué"
                    sx={{ mb: 2, display: 'block' }}
                />

                <TextField
                    {...register("note", { valueAsNumber: true })}
                    label="Note"
                    variant="outlined"
                    fullWidth
                    type="number"
                    disabled={isReadOnly || notEvaluated}
                    error={!!errors.note}
                    helperText={errors.note?.message}
                    slotProps={{ htmlInput: { step: "0.01" } }}
                    sx={{ mb: 2 }}
                />
                {isRattrapage && (
                    <FormControlLabel
                        control={
                            <Controller
                                name="is_validated"
                                control={control}
                                render={({ field }) => (
                                    <Switch
                                        {...field}
                                        checked={field.value}
                                        disabled={isReadOnly}
                                    />
                                )}
                            />
                        }
                        label="Validée"
                        sx={{ mb: 2, display: 'block' }}
                    />
                )}
                <TextField
                    {...register("remarque")}
                    label="Remarque"
                    variant="outlined"
                    fullWidth
                    multiline
                    rows={4}
                    disabled={isReadOnly}
                    error={!!errors.remarque}
                    helperText={errors.remarque?.message as string}
                    sx={{ mb: 2 }}
                />
            </>
        );
    };

const createNoteMatiereColumns = (isRattrapage: boolean): MRT_ColumnDef<NoteControle>[] => [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'version', header: 'Version' },
    {
        accessorFn: (row) => `${row.lastName || ''} ${row.firstName || ''}`,
        header: 'Élève',
    },
    {
        accessorKey: 'note',
        header: 'Note',
        Cell: ({ cell, row }) => {
            if (row.original.not_evaluated) return 'N.E.';
            const valeur = cell.getValue<number | null>();
            return valeur != null ? valeur.toFixed(2) : '-';
        }
    },
    ...(isRattrapage ? [{
        accessorKey: 'is_validated' as const,
        header: 'Validée',
        Cell: ({ cell }: { cell: MRT_Cell<NoteControle> }) => cell.getValue() ? 'Oui' : 'Non',
    }] : []),
    { accessorKey: 'not_evaluated', header: 'Non évalué', Cell: ({ cell }: { cell: MRT_Cell<NoteControle> }) => cell.getValue() ? 'Oui' : '-' },
    { accessorKey: 'remarque', header: 'Remarque' },
];

export const noteControleViewConfig = (controleId: string, isRattrapage: boolean): ViewConfig<NoteControle> => {
    return {
        schema: noteControleSchema,
        emptyValue: { id: -1, version: -1, controle_id: parseInt(controleId), is_validated: false, not_evaluated: false, note: 0 },
        columns: createNoteMatiereColumns(isRattrapage),
        render: createNoteMatiereFields(isRattrapage),
    }
};
export const createNoteControleRepository = (controleId: string) => {
    return createRepository<NoteControle>({
        endpoint: `${ENDPOINT_NOTE_CONTROLE}`,
        queryParams: `?controle_id=${controleId}`,
        queryKey: [NOTE, 'controle', controleId],
        getId: (data: NoteControle) => data.id,
    })
}

export function CrudNoteControle({ mode, workflow, isAction, isTopToolbar, renderRowActions }: CrudProps<NoteControle>) {

    const { controleId } = useParams();
    const { chartOpen, setChartOpen, chartData, handleOpenChart } = useNoteChart<NoteControle>();
    const rootPath = useRootPath(mode);

    const { data: controle } = useQuery<Controle>({
        queryKey: ['controle', controleId],
        queryFn: () => apiInstance.get<Controle>(`${ENDPOINT_CONTROLE}/${controleId}`).then(r => r.data),
        enabled: !!controleId,
    });

    const isRattrapage = controle?.is_rattrapage ?? false;

    if (!controleId) return (
        <Typography>Le paramètre matiereId est obligatoire</Typography>
    )

    const datasource = useMemo((): Datasource<NoteControle> => ({
        ...createNoteControleRepository(controleId),
        ...noteControleViewConfig(controleId, isRattrapage),
        title: "Notes du controle",
        isAction,
        renderRowActions,
        isTopToolbar,
        renderTopToolbarCustomActions: ({ table, defaultActions }) => (
            <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {defaultActions}
                <NoteChartButton onClick={() => handleOpenChart(table)} />
            </Box>
        )
    }), [rootPath, workflow, isRattrapage]);


    return (
        <>
            <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
            <NoteChartModal open={chartOpen} onClose={() => setChartOpen(false)} data={chartData} />
        </>
    )
}