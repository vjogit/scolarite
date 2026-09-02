import { FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Controller } from 'react-hook-form';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { ueSchema, type Ue, createUeRepository, ACTION_MATIERES, ueEntite } from './entites/ue';

export type { Ue } from './entites/ue';

const UeFields = ({ register, errors, control, isReadOnly }: RenderProps<Ue>) => {
    const { t } = useTranslation('structure');
    return (
        <>
            <TextField
                {...register("name")}
                label={t('ue.champNom')}
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
                        label={t('ue.champAcademique')}
                        sx={{ mb: 2 }}
                    />
                )}
            />
        </>

    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function ueColonnes(t: TFunction<'structure'>): ColumnDef<Ue>[] {
    return [
        {
            accessorKey: 'id',
            header: t('commun.id'),
        },
        {
            accessorKey: 'version',
            header: t('commun.version'),
        },
        {
            accessorKey: 'name',
            header: t('commun.nom'),
        },
        {
            accessorKey: 'ects',
            header: 'ECTS',
        },
        {
            accessorKey: 'academique',
            header: t('ue.champAcademique'),
            cell: ({ cell }) => cell.getValue<boolean>() ? t('commun.oui') : t('commun.non'),
        },
    ];
}

function createUeViewConfig(periodeId: string, t: TFunction<'structure'>): ViewConfig<Ue> {
    return {
        schema: ueSchema,
        emptyValue: { id: -1, version: -1, academique: true, periode_id: parseInt(periodeId) },
        colonnes: ueColonnes(t),
        render: UeFields,
    }
}

export function CrudUe({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Ue>) {

    const { periodeId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Ue> | null => periodeId ? ({
        ...createUeRepository(periodeId),
        ...createUeViewConfig(periodeId, tStructure),
        ...ueEntite(t),
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_MATIERES(t)],
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [periodeId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tStructure('ue.erreurPeriodeIdObligatoire')}</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
