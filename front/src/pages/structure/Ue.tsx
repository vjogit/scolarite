import { FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller } from 'react-hook-form';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { ueSchema, type Ue, createUeRepository, ACTION_MATIERES, ueEntite } from './entites/ue';

export type { Ue } from './entites/ue';

const UeFields = ({ register, errors, control, isReadOnly }: RenderProps<Ue>) => (
    <>
        <TextField
            {...register("name")}
            label="Nom de l'UE"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />
        <TextField
            {...register("ects", { valueAsNumber: true })}
            label="ECTS"
            variant="outlined"
            fullWidth
            type="number"
            disabled={isReadOnly}
            error={!!errors.ects}
            helperText={errors.ects?.message}
            sx={{ mb: 2 }}
        />
        <Controller
            name="academique"
            control={control}
            render={({ field }) => (
                <FormControlLabel
                    control={<Switch {...field} checked={field.value} disabled={isReadOnly} />}
                    label="Académique"
                    sx={{ mb: 2 }}
                />
            )}
        />
    </>

);

const ueColumns: MRT_ColumnDef<Ue>[] = [
    {
        accessorKey: 'id',
        header: 'ID',
    },
    {
        accessorKey: 'version',
        header: 'Version',
    },
    {
        accessorKey: 'name',
        header: 'Nom',
    },
    {
        accessorKey: 'ects',
        header: 'ECTS',
    },
    {
        accessorKey: 'academique',
        header: 'Académique',
        Cell: ({ cell }) => cell.getValue<boolean>() ? 'Oui' : 'Non',
    },
]

const createUeViewConfig = (periodeId: string): ViewConfig<Ue> => {
    return {
        schema: ueSchema,
        emptyValue: { id: -1, version: -1, academique: true, periode_id: parseInt(periodeId) },
        columns: ueColumns,
        render: UeFields,
    }
};

export function CrudUe({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Ue>) {

    const { periodeId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');

    const datasource = useMemo((): Datasource<Ue> | null => periodeId ? ({
        ...createUeRepository(periodeId),
        ...createUeViewConfig(periodeId),
        ...ueEntite(t),
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_MATIERES(t)],
        isTopToolbar,
        renderTopToolbarCustomActions,
    }) : null, [periodeId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, t]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre periodeId est obligatoire</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
