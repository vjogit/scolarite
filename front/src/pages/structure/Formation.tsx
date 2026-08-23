import { z } from 'zod'; // Import de Zod
import { createRepository, type DescriptionEntite } from '../../services/crud/def';
import { TextField } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import type { FieldValues } from 'react-hook-form';
import type { ActionNavigation } from '../../services/crud/actions';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { ENDPOINT_FORMATION, FORMATION, PROMOTION, STRUCTURE, ENDPOINT_FORMATION_DELETE_IMPACT } from './def';
import { useMemo } from 'react';
import type { MRT_ColumnDef } from 'material-react-table';
import { Crud } from '../../services/crud/Crud';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';


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
    endpoint: ENDPOINT_FORMATION,
    deleteImpactEndpoint: ENDPOINT_FORMATION_DELETE_IMPACT,
    queryKey: [STRUCTURE, FORMATION],
    getId: (data: Formation) => data.id,
});


/** Descente vers les promotions de la formation. */
export const ACTION_PROMOTIONS: ActionNavigation<FieldValues> = {
    id: 'promotions',
    libelle: 'Gérer les promotions',
    icone: ListAltIcon,
    segment: PROMOTION,
};

/** Ce que la formation est, quel que soit l'écran qui l'affiche. */
export const formationEntite: DescriptionEntite = {
    title: "Formations",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "la formation",
    entityLabelPlural: "formations",
    deleteRequiresNameConfirmation: true,
    suppressionEnCorbeille: true,
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
