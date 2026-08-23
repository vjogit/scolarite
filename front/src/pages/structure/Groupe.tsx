import { z } from 'zod';
import { TextField, Typography, Box } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig, type DescriptionEntite } from '../../services/crud/def';
import type { FieldValues } from 'react-hook-form';
import type { ActionNavigation } from "../../services/crud/actions";
import { useMemo, useCallback, type ReactNode } from "react";
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { ENDPOINT_GROUPE, GROUPE, STRUCTURE } from './def';
import { useRootPath } from '../../services/crud/useRootPath';
import PeopleIcon from '@mui/icons-material/People';
import { GroupeMultiImportButton } from './GroupeMultiImportButton';
import { Role } from '../user/def';


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

/**
 * Descente vers les membres du groupe. Le segment `user` est celui de la
 * greffe `MEMBRES` du catalogue, seul workflow où les groupes apparaissent.
 */
export const ACTION_MEMBRES: ActionNavigation<FieldValues> = {
    id: 'membres',
    libelle: 'Gérer les membres',
    icone: PeopleIcon,
    segment: 'user',
};

/** Ce que le groupe est, quel que soit l'écran qui l'affiche. */
export const groupeEntite: DescriptionEntite = {
    title: "Groupes",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "le groupe",
    entityLabelPlural: "groupes",
};

export function CrudGroupe({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Groupe>) {
    const { optionId } = useParams();
    const rootPath = useRootPath(mode);

    const defaultRenderTopToolbar = useCallback(({ defaultActions, peutEcrire }: { defaultActions: ReactNode; peutEcrire: boolean }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            {peutEcrire && optionId && <GroupeMultiImportButton optionId={optionId} />}
        </Box>
    ), [optionId]);

    const datasource = useMemo((): Datasource<Groupe> | null => optionId ? ({
        ...createGroupeRepository(optionId),
        ...createGroupeViewConfig(optionId),
        ...groupeEntite,
        isAction,
        isReadOnly,
        isTopToolbar,
        actionsLigne: actionsLigne ?? [ACTION_MEMBRES],
        renderTopToolbarCustomActions: renderTopToolbarCustomActions ?? defaultRenderTopToolbar,
    }) : null, [optionId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, defaultRenderTopToolbar]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre optionId est obligatoire</Typography>
    );

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    );
}
