import { TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import { Controller } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { periodeSchema, type Periode, createPeriodeRepository, ACTION_UES, periodeEntite } from './entites/periode';

export type { Periode } from './entites/periode';

const PeriodeFields = ({ register, control, errors, isReadOnly }: RenderProps<Periode>) => (
    <>
        <TextField
            {...register("name")}
            label="Nom de la période"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />

        <Controller
            name="debut"
            control={control}
            render={({ field }) => (
                <DatePicker
                    label="Date de début"
                    // Le schéma type ce champ `Date`, mais `emptyValue` ne le contient
                    // pas : en création, react-hook-form donne `undefined`. Et
                    // `dayjs(undefined)` rend l'heure courante, pas une date
                    // invalide — sans ce garde, le formulaire s'ouvre avec la date
                    // du jour pré-remplie. Vérifié au navigateur.
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    value={field.value ? dayjs(field.value) : null}
                    onChange={(newValue) => {
                        field.onChange(newValue ? newValue.toDate() : null);
                    }}
                    disabled={isReadOnly}
                    slotProps={{
                        textField: {
                            error: !!errors.debut,
                            helperText: errors.debut?.message,
                            fullWidth: true
                        }
                    }}
                />
            )}
        />

        <Controller
            name="fin"
            control={control}
            render={({ field }) => (
                <DatePicker
                    label="Date de fin"
                    // Le schéma type ce champ `Date`, mais `emptyValue` ne le contient
                    // pas : en création, react-hook-form donne `undefined`. Et
                    // `dayjs(undefined)` rend l'heure courante, pas une date
                    // invalide — sans ce garde, le formulaire s'ouvre avec la date
                    // du jour pré-remplie. Vérifié au navigateur.
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    value={field.value ? dayjs(field.value) : null}
                    onChange={(newValue) => {
                        field.onChange(newValue ? newValue.toDate() : null);
                    }}
                    disabled={isReadOnly}
                    slotProps={{
                        textField: {
                            error: !!errors.fin,
                            helperText: errors.fin?.message,
                            fullWidth: true
                        }
                    }}
                />
            )}
        />
    </>
);

const periodeColumns: MRT_ColumnDef<Periode>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'version', header: 'Version' },
    { accessorKey: 'name', header: 'Nom' },
    {
        accessorKey: 'debut',
        header: 'Début',
        Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
    },
    {
        accessorKey: 'fin',
        header: 'Fin',
        Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
    },
]

const createPeriodeViewConfig = (optionId: string): ViewConfig<Periode> => {
    return {
        schema: periodeSchema,
        emptyValue: { id: -1, version: -1, option_id: parseInt(optionId) },
        columns: periodeColumns,
        render: PeriodeFields,
    }
};

export function CrudPeriode({ mode, workflow, isAction, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, isReadOnly }: CrudProps<Periode>) {

    const { optionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');

    const datasource = useMemo((): Datasource<Periode> | null => optionId ? ({
        ...createPeriodeRepository(optionId),
        ...createPeriodeViewConfig(optionId),
        ...periodeEntite(t),
        isAction,
        actionsLigne: actionsLigne ?? [ACTION_UES(t)],
        isTopToolbar,
        renderTopToolbarCustomActions,
        isReadOnly,
    }) : null, [optionId, isAction, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, isReadOnly, t]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre optionId est obligatoire</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
