import { z } from 'zod';
import { TextField, Typography, Tooltip, IconButton, Box } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import { useMemo, useCallback, type ReactNode } from "react";
import { Crud } from "../../services/crud/Crud";
import { useParams, useNavigate } from 'react-router';
import type { MRT_ColumnDef, MRT_Row } from 'material-react-table';
import { ENDPOINT_GROUPE, GROUPE, STRUCTURE } from './def';
import { useRootPath } from '../../services/crud/useRootPath';
import PeopleIcon from '@mui/icons-material/People';
import { GroupeMultiImportButton } from './GroupeMultiImportButton';


const groupeSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    option_id: z.number(),
});

export type Groupe = z.infer<typeof groupeSchema>;

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

export const groupeColumns: MRT_ColumnDef<Groupe>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'version', header: 'Version' },
    { accessorKey: 'name', header: 'Nom' },
];

export const createGroupeViewConfig = (optionId: string): ViewConfig<Groupe> => ({
    schema: groupeSchema,
    emptyValue: { id: -1, version: -1, option_id: parseInt(optionId) },
    columns: groupeColumns,
    render: GroupeFields,
});

export const createGroupeRepository = (optionId: string) =>
    createRepository<Groupe>({
        endpoint: ENDPOINT_GROUPE,
        queryParams: `?option_id=${optionId}`,
        queryKey: [STRUCTURE, GROUPE, optionId],
        getId: (data: Groupe) => data.id,
    });

export function GroupeDefaultAction({ groupeId, rootPath }: { groupeId: number; rootPath: string }) {
    const navigate = useNavigate();
    return (
        <Tooltip title="Gérer les membres">
            <IconButton onClick={() => navigate(`/${rootPath}/${groupeId}/user`)}>
                <PeopleIcon />
            </IconButton>
        </Tooltip>
    );
}

export function CrudGroupe({ mode, workflow, isAction, isReadOnly, isTopToolbar, renderRowActions, renderTopToolbarCustomActions }: CrudProps<Groupe>) {
    const { optionId } = useParams();
    const rootPath = useRootPath(mode);

    if (!optionId) return (
        <Typography>Le paramètre optionId est obligatoire</Typography>
    );

    const defaultRenderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Groupe>; defaultActions: ReactNode }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <GroupeDefaultAction groupeId={row.getValue('id')} rootPath={rootPath} />
        </Box>
    ), [rootPath]);

    const defaultRenderTopToolbar = useCallback(({ defaultActions, isEditMode }: { defaultActions: ReactNode; isEditMode: boolean }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            {isEditMode && <GroupeMultiImportButton optionId={optionId} />}
        </Box>
    ), [optionId]);

    const datasource = useMemo((): Datasource<Groupe> => ({
        ...createGroupeRepository(optionId),
        ...createGroupeViewConfig(optionId),
        title: "Groupes",
        isAction,
        isReadOnly,
        isTopToolbar,
        renderRowActions: renderRowActions ?? defaultRenderRowActions,
        renderTopToolbarCustomActions: renderTopToolbarCustomActions ?? defaultRenderTopToolbar,
    }), [optionId, isAction, isReadOnly, isTopToolbar, renderRowActions, renderTopToolbarCustomActions, defaultRenderRowActions, defaultRenderTopToolbar]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    );
}
