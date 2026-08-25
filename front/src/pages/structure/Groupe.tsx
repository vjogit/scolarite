import { TextField, Typography, Box } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { GroupeMultiImportButton } from './GroupeMultiImportButton';
import { groupeSchema, type Groupe, createGroupeRepository, ACTION_MEMBRES, groupeEntite } from './entites/groupe';

export type { Groupe } from './entites/groupe';

const GroupeFields = ({ register, errors, isReadOnly }: RenderProps<Groupe>) => {
    const { t } = useTranslation('structure');
    return (
        <>
            <TextField
                {...register("name")}
                label={t('groupe.champNom')}
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

function groupeColumns(t: TFunction<'structure'>): MRT_ColumnDef<Groupe>[] {
    return [
        { accessorKey: 'id', header: t('commun.id') },
        { accessorKey: 'version', header: t('commun.version') },
        { accessorKey: 'name', header: t('commun.nom') },
    ];
}

function createGroupeViewConfig(optionId: string, t: TFunction<'structure'>): ViewConfig<Groupe> {
    return {
        schema: groupeSchema,
        emptyValue: { id: -1, version: -1, option_id: parseInt(optionId) },
        columns: groupeColumns(t),
        render: GroupeFields,
    };
}

export function CrudGroupe({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Groupe>) {
    const { optionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const defaultRenderTopToolbar = useCallback(({ defaultActions, peutEcrire }: { defaultActions: ReactNode; peutEcrire: boolean }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            {peutEcrire && optionId && <GroupeMultiImportButton optionId={optionId} />}
        </Box>
    ), [optionId]);

    const datasource = useMemo((): Datasource<Groupe> | null => optionId ? ({
        ...createGroupeRepository(optionId),
        ...createGroupeViewConfig(optionId, tStructure),
        ...groupeEntite(t),
        isAction,
        isReadOnly,
        isTopToolbar,
        actionsLigne: actionsLigne ?? [ACTION_MEMBRES(t)],
        renderTopToolbarCustomActions: renderTopToolbarCustomActions ?? defaultRenderTopToolbar,
    }) : null, [optionId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, defaultRenderTopToolbar, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tStructure('groupe.erreurOptionIdObligatoire')}</Typography>
    );

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    );
}
