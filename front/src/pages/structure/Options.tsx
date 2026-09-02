import { TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { optionSchema, type Option, createOptionRepository, ACTION_PERIODES, optionEntite } from './entites/option';

export type { Option } from './entites/option';

const OptionFields = ({ register, errors, isReadOnly }: RenderProps<Option>) => {
    const { t } = useTranslation('structure');
    return (
        <>
            <TextField
                {...register("name")}
                label={t('option.champNom')}
                variant="outlined"
                fullWidth
                disabled={isReadOnly}
                error={!!errors.name}
                helperText={errors.name?.message}
                sx={{ mb: 2 }}
            />

        </>
    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function optionColonnes(t: TFunction<'structure'>): ColumnDef<Option>[] {
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

    ];
}

function createOptionViewConfig(promotionId: string, t: TFunction<'structure'>): ViewConfig<Option> {
    return {
        schema: optionSchema,
        emptyValue: { id: -1, version: -1, promotion_id: parseInt(promotionId) },
        colonnes: optionColonnes(t),
        render: OptionFields,
    }
}

export function CrudOption({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Option>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Option> | null => promotionId ? ({
        ...createOptionRepository(promotionId),
        ...createOptionViewConfig(promotionId, tStructure),
        ...optionEntite(t),
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_PERIODES(t)],
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [promotionId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tStructure('option.erreurFormationIdObligatoire')}</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
