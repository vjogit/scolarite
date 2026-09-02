import { TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import { Controller } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { periodeSchema, type Periode, createPeriodeRepository, ACTION_UES, periodeEntite } from './entites/periode';

export type { Periode } from './entites/periode';

const PeriodeFields = ({ register, control, errors, isReadOnly }: RenderProps<Periode>) => {
    const { t } = useTranslation('structure');
    return (
        <>
            <TextField
                {...register("name")}
                label={t('periode.champNom')}
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
                        label={t('commun.dateDebut')}
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
                        label={t('commun.dateFin')}
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
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function periodeColonnes(t: TFunction<'structure'>): ColumnDef<Periode>[] {
    return [
        { accessorKey: 'id', header: t('commun.id') },
        { accessorKey: 'version', header: t('commun.version') },
        { accessorKey: 'name', header: t('commun.nom') },
        {
            accessorKey: 'debut',
            header: t('commun.debut'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
        {
            accessorKey: 'fin',
            header: t('commun.fin'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
    ];
}

function createPeriodeViewConfig(optionId: string, t: TFunction<'structure'>): ViewConfig<Periode> {
    return {
        schema: periodeSchema,
        emptyValue: { id: -1, version: -1, option_id: parseInt(optionId) },
        colonnes: periodeColonnes(t),
        render: PeriodeFields,
    }
}

export function CrudPeriode({ mode, workflow, isAction, isTopToolbar, actionsLigne, actionsBarreOutils, isReadOnly }: CrudProps<Periode>) {

    const { optionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Periode> | null => optionId ? ({
        ...createPeriodeRepository(optionId),
        ...createPeriodeViewConfig(optionId, tStructure),
        ...periodeEntite(t),
        isAction,
        actionsLigne: actionsLigne ?? [ACTION_UES(t)],
        isTopToolbar,
        actionsBarreOutils,
        isReadOnly,
    }) : null, [optionId, isAction, isTopToolbar, actionsLigne, actionsBarreOutils, isReadOnly, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tStructure('periode.erreurOptionIdObligatoire')}</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
