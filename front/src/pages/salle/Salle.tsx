import { z } from 'zod';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { MenuItem, TextField } from '@mui/material';
import { useMemo } from 'react';
import { Crud } from '../../services/crud/Crud';
import { ENDPOINT_SALLE, SALLE, typeSalleOptions } from './def';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';
import { messageValidation } from '../../i18n/validation';

const salleSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, { error: messageValidation('nomRequis') }),
    capacite: z.number().min(0, { error: messageValidation('capaciteDoitEtrePositive') }),
    equipement: z.string().nullish(),
    type_salle: z.string().nullish(),
    batiment: z.string().nullish(),
});

export type Salle = z.infer<typeof salleSchema>;

const SalleFields = ({ register, control, errors, isReadOnly }: RenderProps<Salle>) => {
    const { t } = useTranslation('salle');
    return (
        <>
            <TextField
                {...register('name')}
                label={t('champs.nom')}
                variant="outlined"
                fullWidth
                disabled={isReadOnly}
                error={!!errors.name}
                helperText={errors.name?.message}
                sx={{ mb: 2 }}
            />
            <TextField
                {...register('capacite')}
                label={t('champs.capacite')}
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
                        label={t('champs.typeSalle')}
                        variant="outlined"
                        fullWidth
                        disabled={isReadOnly}
                        error={!!errors.type_salle}
                        helperText={errors.type_salle?.message}
                        sx={{ mb: 2 }}
                    >
                        <MenuItem value=""><em>—</em></MenuItem>
                        {typeSalleOptions(t).map((opt) => (
                            <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
                        ))}
                    </TextField>
                )}
            />
            <TextField
                {...register('batiment')}
                label={t('champs.batiment')}
                variant="outlined"
                fullWidth
                disabled={isReadOnly}
                error={!!errors.batiment}
                helperText={errors.batiment?.message}
                sx={{ mb: 2 }}
            />
            <TextField
                {...register('equipement')}
                label={t('champs.equipement')}
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
};

function salleColumns(t: TFunction<'salle'>): MRT_ColumnDef<Salle>[] {
    return [
        { accessorKey: 'id', header: t('colonnes.id') },
        { accessorKey: 'version', header: t('colonnes.version') },
        { accessorKey: 'name', header: t('champs.nom') },
        { accessorKey: 'capacite', header: t('champs.capacite') },
        {
            accessorKey: 'type_salle',
            header: t('colonnes.type'),
            Cell: ({ cell }) => {
                const val = cell.getValue<string | null>();
                return typeSalleOptions(t).find((o) => o.id === val)?.label ?? val ?? '—';
            },
        },
        { accessorKey: 'batiment', header: t('champs.batiment') },
        { accessorKey: 'equipement', header: t('champs.equipement') },
    ];
}

function salleViewConfig(t: TFunction<'salle'>): ViewConfig<Salle> {
    return {
        schema: salleSchema,
        emptyValue: { id: -1, version: 0, name: '', capacite: 1, equipement: null, type_salle: null, batiment: null },
        columns: salleColumns(t),
        render: SalleFields,
    };
}

const salleDatasourceBase = createRepository<Salle>({
    endpoint: ENDPOINT_SALLE,
    queryKey: [SALLE],
    getId: (data: Salle) => data.id,
});

export function CrudSalle({ mode, workflow, isAction, isTopToolbar, renderTopToolbarCustomActions }: CrudProps<Salle>) {
    const rootPath = useRootPath(mode);
    const { t: tCrud } = useTranslation('crud');
    const { t: tSalle } = useTranslation('salle');

    const datasource = useMemo((): Datasource<Salle> => ({
        ...salleDatasourceBase,
        ...salleViewConfig(tSalle),
        title: tCrud('entites.salle.title'),
        roleEcriture: Role.SALLES_ECRITURE,
        entityLabel: tCrud('entites.salle.nom'),
        entityLabelAvecArticle: tCrud('entites.salle.nomAvecArticle'),
        entityLabelPlural: tCrud('entites.salle.nomPluriel'),
        entityGender: 'f',
        isAction,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [isAction, isTopToolbar, renderTopToolbarCustomActions, tCrud, tSalle]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    );
}
