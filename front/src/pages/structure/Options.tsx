import { TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { optionSchema, type Option, createOptionRepository, ACTION_PERIODES, optionEntite } from './entites/option';

export type { Option } from './entites/option';

const OptionFields = ({ register, errors, isReadOnly }: RenderProps<Option>) => (
    <>
        <TextField
            {...register("name")}
            label="Nom de l'option"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />

    </>
);

const optionColumns: MRT_ColumnDef<Option>[] = [
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

]

const createOptionViewConfig = (promotionId: string): ViewConfig<Option> => {
    return {
        schema: optionSchema,
        emptyValue: { id: -1, version: -1, promotion_id: parseInt(promotionId) },
        columns: optionColumns,
        render: OptionFields,
    }
};

export function CrudOption({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Option>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);

    const datasource = useMemo((): Datasource<Option> | null => promotionId ? ({
        ...createOptionRepository(promotionId),
        ...createOptionViewConfig(promotionId),
        ...optionEntite,
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_PERIODES],
        isTopToolbar,
        renderTopToolbarCustomActions,
    }) : null, [promotionId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre formationId est obligatoire</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
