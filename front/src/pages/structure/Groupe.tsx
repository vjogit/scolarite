import { TextField, Typography, Box } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { GroupeMultiImportButton } from './GroupeMultiImportButton';
import { groupeSchema, type Groupe, createGroupeRepository, ACTION_MEMBRES, groupeEntite } from './entites/groupe';

export type { Groupe } from './entites/groupe';

const GroupeFields = ({ register, errors, isReadOnly }: RenderProps<Groupe>) => (
    <>
        <TextField
            {...register("name")}
            label="Nom du groupe"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />
    </>
);

const groupeColumns: MRT_ColumnDef<Groupe>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'version', header: 'Version' },
    { accessorKey: 'name', header: 'Nom' },
];

const createGroupeViewConfig = (optionId: string): ViewConfig<Groupe> => ({
    schema: groupeSchema,
    emptyValue: { id: -1, version: -1, option_id: parseInt(optionId) },
    columns: groupeColumns,
    render: GroupeFields,
});

export function CrudGroupe({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Groupe>) {
    const { optionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');

    const defaultRenderTopToolbar = useCallback(({ defaultActions, peutEcrire }: { defaultActions: ReactNode; peutEcrire: boolean }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            {peutEcrire && optionId && <GroupeMultiImportButton optionId={optionId} />}
        </Box>
    ), [optionId]);

    const datasource = useMemo((): Datasource<Groupe> | null => optionId ? ({
        ...createGroupeRepository(optionId),
        ...createGroupeViewConfig(optionId),
        ...groupeEntite(t),
        isAction,
        isReadOnly,
        isTopToolbar,
        actionsLigne: actionsLigne ?? [ACTION_MEMBRES(t)],
        renderTopToolbarCustomActions: renderTopToolbarCustomActions ?? defaultRenderTopToolbar,
    }) : null, [optionId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, defaultRenderTopToolbar, t]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre optionId est obligatoire</Typography>
    );

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    );
}
