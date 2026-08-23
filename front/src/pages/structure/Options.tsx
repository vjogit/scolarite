import { z } from 'zod'; // Import de Zod
import { TextField, Typography } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig, type DescriptionEntite } from '../../services/crud/def';
import type { FieldValues } from 'react-hook-form';
import type { ActionNavigation } from "../../services/crud/actions";
import { useMemo } from "react";
import { Crud } from "../../services/crud/Crud";
import ListAltIcon from '@mui/icons-material/ListAlt';
import GroupsIcon from '@mui/icons-material/Groups';
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { ENDPOINT_OPTION, GROUPE, OPTION, PERIODE, STRUCTURE, ENDPOINT_OPTION_DELETE_IMPACT } from './def';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';


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

/** Descente vers les groupes de l'option. */
export const ACTION_GROUPES: ActionNavigation<FieldValues> = {
    id: 'groupes',
    libelle: 'Gérer les groupes',
    icone: GroupsIcon,
    segment: GROUPE,
};

/** Descente vers les périodes de l'option. */
export const ACTION_PERIODES: ActionNavigation<FieldValues> = {
    id: 'periodes',
    libelle: 'Gérer les périodes',
    icone: ListAltIcon,
    segment: PERIODE,
};

/** Ce que l'option est, quel que soit l'écran qui l'affiche. */
export const optionEntite: DescriptionEntite = {
    title: "Options",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "l'option",
    entityLabelPlural: "options",
    suppressionEnCorbeille: true,
    entityGender: 'f',
};

export function CrudOption({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Option>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);

    if (!promotionId) return (
        <Typography>Le paramètre formationId est obligatoire</Typography>
    )


    const datasource = useMemo((): Datasource<Option> => ({
        ...createOptionRepository(promotionId),
        ...createOptionViewConfig(promotionId),
        ...optionEntite,
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_PERIODES],
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [promotionId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
