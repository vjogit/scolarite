import { z } from 'zod'; // Import de Zod
import { createRepository } from '../../services/crud/def';
import { Box, IconButton, TextField, Tooltip } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useNavigate } from 'react-router';
import { ENDPOINT_FORMATION, FORMATION, PROMOTION, STRUCTURE, ENDPOINT_FORMATION_DELETE_IMPACT } from './def';
import { useCallback, useMemo, type ReactNode } from 'react';
import type { MRT_ColumnDef, MRT_Row } from 'material-react-table';
import { Crud } from '../../services/crud/Crud';
import { useRootPath } from '../../services/crud/useRootPath';


const formationSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, "Le nom est requis")
});

export type Formation = z.infer<typeof formationSchema>;

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

export const formationColumns: MRT_ColumnDef<Formation>[] = [
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

export const formationViewConfig: ViewConfig<Formation> = {
    schema: formationSchema,
    emptyValue: { id: -1, version: -1 },
    columns: formationColumns,
    render: FormationFields,
};

// Partie statique : à l'extérieur du composant
export const formationRepository = createRepository<Formation>({
    endpoint: `${ENDPOINT_FORMATION}`,
    deleteImpactEndpoint: `${ENDPOINT_FORMATION_DELETE_IMPACT}`,
    queryKey: [STRUCTURE, FORMATION],
    getId: (data: Formation) => data.id,
});


export function FormationDefaultAction({ formationId, rootPath }: { formationId: number, rootPath: string }) {
    const navigate = useNavigate();
    return (
        <Tooltip title="Gérer les promotions">
            <IconButton onClick={() => navigate(`${rootPath}/${formationId}/${PROMOTION}`)}>
                <ListAltIcon />
            </IconButton>
        </Tooltip>
    );
}

export function CrudFormation({ mode, workflow, isAction, isTopToolbar, isReadOnly, renderRowActions, renderTopToolbarCustomActions }: CrudProps<Formation>) {

    const rootPath = useRootPath(mode);

    const defaultRenderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Formation>, defaultActions: ReactNode }): ReactNode => {
        return (<Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <FormationDefaultAction formationId={row.getValue('id')} rootPath={rootPath} />
        </Box>
        )
    }, [rootPath]);

    const datasource = useMemo((): Datasource<Formation> => ({
        ...formationRepository,
        ...formationViewConfig,
        title: "Formations",
        entityLabel: "la formation",
        entityLabelPlural: "formations",
        deleteRequiresNameConfirmation: true,
        isAction,
        isReadOnly,
        renderRowActions: renderRowActions ? renderRowActions : defaultRenderRowActions,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [defaultRenderRowActions, isAction, isTopToolbar, renderRowActions, renderTopToolbarCustomActions]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
