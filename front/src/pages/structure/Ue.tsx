import { z } from 'zod'; // Import de Zod
import { FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig, type DescriptionEntite } from '../../services/crud/def';
import type { ActionNavigation } from "../../services/crud/actions";
import { useMemo } from "react";
import { Controller, type FieldValues } from "react-hook-form";
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import ListAltIcon from '@mui/icons-material/ListAlt';
import type { MRT_ColumnDef } from 'material-react-table';
import { ENDPOINT_UES, MATIERE, STRUCTURE, UES } from './def';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';


const ueSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    ects: z.number().min(0, "Les ects doivent être positifs"),
    academique: z.boolean(),
    periode_id: z.number(),
})

export type Ue = z.infer<typeof ueSchema>;

const UeFields = ({ register, errors, control, isReadOnly }: RenderProps<Ue>) => (
    <>
        <TextField
            {...register("name")}
            label="Nom de l'ue"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />
        <TextField
            {...register("ects", { valueAsNumber: true })}
            label="ECTS"
            variant="outlined"
            fullWidth
            type="number"
            disabled={isReadOnly}
            error={!!errors.ects}
            helperText={errors.ects?.message}
            sx={{ mb: 2 }}
        />
        <Controller
            name="academique"
            control={control}
            render={({ field }) => (
                <FormControlLabel
                    control={<Switch {...field} checked={field.value} disabled={isReadOnly} />}
                    label="Académique"
                    sx={{ mb: 2 }}
                />
            )}
        />
    </>

);

export const periodeColumns: MRT_ColumnDef<Ue>[] = [
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
    {
        accessorKey: 'ects',
        header: 'ECTS',
    },
    {
        accessorKey: 'academique',
        header: 'Académique',
        Cell: ({ cell }) => cell.getValue<boolean>() ? 'Oui' : 'Non',
    },
]

export const createUeViewConfig = (periodeId: string): ViewConfig<Ue> => {
    return {
        schema: ueSchema,
        emptyValue: { id: -1, version: -1, academique: true, periode_id: parseInt(periodeId) },
        columns: periodeColumns,
        render: UeFields,
    }
};

// Partie statique : à l'extérieur du composant
export const createUeRepository = (periodeId: string) => {
    return createRepository<Ue>({
        endpoint: `${ENDPOINT_UES}`,
        queryParams: `?periode_id=${periodeId}`,
        queryKey: [STRUCTURE, UES, periodeId],
        getId: (data: Ue) => data.id,
    })
}

/** Descente vers les matières de l'UE. */
export const ACTION_MATIERES: ActionNavigation<FieldValues> = {
    id: 'matieres',
    libelle: 'Gérer les matières',
    icone: ListAltIcon,
    segment: MATIERE,
};

/** Ce que l'UE est, quel que soit l'écran qui l'affiche. */
export const ueEntite: DescriptionEntite = {
    title: "UE",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "l'UE",
    entityLabelPlural: "UE",
    entityGender: 'f',
};

export function CrudUe({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Ue>) {

    const { periodeId } = useParams();
    const rootPath = useRootPath(mode);

    if (!periodeId) return (
        <Typography>Le paramètre periodeId est obligatoire</Typography>
    )

    const datasource = useMemo((): Datasource<Ue> => ({
        ...createUeRepository(periodeId),
        ...createUeViewConfig(periodeId),
        ...ueEntite,
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_MATIERES],
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [periodeId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
