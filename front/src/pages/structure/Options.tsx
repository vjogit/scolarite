import { z } from 'zod'; // Import de Zod
import { TextField, Tooltip, IconButton, Typography, Box } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import { useMemo, useCallback, type ReactNode } from "react";
import { Crud } from "../../services/crud/Crud";
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useNavigate, useParams } from 'react-router';
import type { MRT_ColumnDef, MRT_Row } from 'material-react-table';
import { ENDPOINT_OPTION,  OPTION, PERIODE, STRUCTURE, ENDPOINT_OPTION_DELETE_IMPACT } from './def';
import { useRootPath } from '../../services/crud/useRootPath';


const optionSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, "Le nom est requis"),
    promotion_id: z.number(),
})

export type Option = z.infer<typeof optionSchema>;

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

export const optionColumns: MRT_ColumnDef<Option>[] = [
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

export const createOptionViewConfig = (promotionId: string): ViewConfig<Option> => {
    return {
        schema: optionSchema,
        emptyValue: { id: -1, version: -1, promotion_id: parseInt(promotionId) },
        columns: optionColumns,
        render: OptionFields,
    }
};

// Partie statique : à l'extérieur du composant
export const createOptionRepository = (promotionId: string) => {
    return createRepository<Option>({
        endpoint: `${ENDPOINT_OPTION}`,
        deleteImpactEndpoint: `${ENDPOINT_OPTION_DELETE_IMPACT}`,
        queryParams: `?promotion_id=${promotionId}`,
        queryKey: [STRUCTURE,OPTION, promotionId],
        getId: (data: Option) => data.id,
    });
}

export function OptionDefaultAction({ optionId, rootPath }: { optionId: number, rootPath: string }) {
    const navigate = useNavigate();
    return (
        <>
            <Tooltip title="Gérer les periodes">
                <IconButton onClick={() => navigate(`/${rootPath}/${optionId}/${PERIODE}`)}>
                    <ListAltIcon />
                </IconButton>
            </Tooltip>
        </>
    );
}

export function CrudOption({ mode, workflow, isAction, isReadOnly,isTopToolbar, renderRowActions, renderTopToolbarCustomActions }: CrudProps<Option>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);

    if (!promotionId) return (
        <Typography>Le paramètre formationId est obligatoire</Typography>
    )


    const defaultRenderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Option>, defaultActions: ReactNode }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <OptionDefaultAction optionId={row.getValue('id')} rootPath={rootPath} />
        </Box>
    ), [rootPath]);

    const datasource = useMemo((): Datasource<Option> => ({
        ...createOptionRepository(promotionId),
        ...createOptionViewConfig(promotionId),
        title: "Options",
        entityLabel: "l'option",
        entityLabelPlural: "options",
        entityGender: 'f',
        isAction,
        isReadOnly,
        renderRowActions: renderRowActions ? renderRowActions : defaultRenderRowActions,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [rootPath, workflow, defaultRenderRowActions]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
