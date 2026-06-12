import { z } from 'zod';
import { Controller } from 'react-hook-form';
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { MenuItem, TextField } from '@mui/material';
import { useMemo } from 'react';
import { Crud } from '../../services/crud/Crud';
import { ENDPOINT_SALLE, SALLE,  TYPE_SALLE_OPTIONS } from './def';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';

const salleSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, 'Le nom est obligatoire'),
    capacite: z.number().min(0, "La capacité doit être positive"),
    equipement: z.string().nullish(),
    type_salle: z.string().nullish(),
    batiment: z.string().nullish(),
});

export type Salle = z.infer<typeof salleSchema>;

const SalleFields = ({ register, control, errors, isReadOnly }: RenderProps<Salle>) => (
    <>
        <TextField
            {...register('name')}
            label="Nom"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />
        <TextField
            {...register('capacite')}
            label="Capacité"
            type="number"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.capacite}
            helperText={errors.capacite?.message}
            sx={{ mb: 2 }}
        />
        <Controller
            name="type_salle"
            control={control}
            render={({ field }) => (
                <TextField
                    {...field}
                    value={field.value ?? ''}
                    select
                    label="Type de salle"
                    variant="outlined"
                    fullWidth
                    disabled={isReadOnly}
                    error={!!errors.type_salle}
                    helperText={errors.type_salle?.message}
                    sx={{ mb: 2 }}
                >
                    <MenuItem value=""><em>—</em></MenuItem>
                    {TYPE_SALLE_OPTIONS.map((opt) => (
                        <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
                    ))}
                </TextField>
            )}
        />
        <TextField
            {...register('batiment')}
            label="Bâtiment"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.batiment}
            helperText={errors.batiment?.message}
            sx={{ mb: 2 }}
        />
        <TextField
            {...register('equipement')}
            label="Équipement"
            variant="outlined"
            fullWidth
            multiline
            rows={2}
            disabled={isReadOnly}
            error={!!errors.equipement}
            helperText={errors.equipement?.message}
            sx={{ mb: 2 }}
        />
    </>
);

export const salleColumns: MRT_ColumnDef<Salle>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'version', header: 'Version' },
    { accessorKey: 'name', header: 'Nom' },
    { accessorKey: 'capacite', header: 'Capacité' },
    {
        accessorKey: 'type_salle',
        header: 'Type',
        Cell: ({ cell }) => {
            const val = cell.getValue<string | null>();
            return TYPE_SALLE_OPTIONS.find((o) => o.id === val)?.label ?? val ?? '—';
        },
    },
    { accessorKey: 'batiment', header: 'Bâtiment' },
    { accessorKey: 'equipement', header: 'Équipement' },
];

export const salleViewConfig: ViewConfig<Salle> = {
    schema: salleSchema,
    emptyValue: { id: -1, version: 0, name: '', capacite: 1, equipement: null, type_salle: null, batiment: null },
    columns: salleColumns,
    render: SalleFields,
};

export const salleDatasourceBase = createRepository<Salle>({
    endpoint: ENDPOINT_SALLE,
    queryKey: [SALLE],
    getId: (data: Salle) => data.id,
});

export function CrudSalle({ mode, workflow, isAction, isTopToolbar, renderTopToolbarCustomActions }: CrudProps<Salle>) {
    const rootPath = useRootPath(mode);

    const datasource = useMemo((): Datasource<Salle> => ({
        ...salleDatasourceBase,
        ...salleViewConfig,
        title: 'Salles',
        isAction,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [isAction, isTopToolbar, renderTopToolbarCustomActions]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    );
}
