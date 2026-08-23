import { TextField } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import type { MRT_ColumnDef } from 'material-react-table';
import { Crud } from '../../services/crud/Crud';
import { useRootPath } from '../../services/crud/useRootPath';
import { formationSchema, type Formation, formationRepository, ACTION_PROMOTIONS, formationEntite } from './entites/formation';

export type { Formation } from './entites/formation';

const FormationFields = ({ register, errors, isReadOnly }: RenderProps<Formation>) => (
    <>
        <TextField
            {...register("name")}
            label="Titre de la formation"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />
    </>
);

const formationColumns: MRT_ColumnDef<Formation>[] = [
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

const formationViewConfig: ViewConfig<Formation> = {
    schema: formationSchema,
    emptyValue: { id: -1, version: -1 },
    columns: formationColumns,
    render: FormationFields,
};

export function CrudFormation({ mode, workflow, isAction, isTopToolbar, isReadOnly, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Formation>) {

    const rootPath = useRootPath(mode);

    const datasource = useMemo((): Datasource<Formation> => ({
        ...formationRepository,
        ...formationViewConfig,
        ...formationEntite,
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_PROMOTIONS],
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
