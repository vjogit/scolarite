import { z } from 'zod';
import { Box, TextField, Typography } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import { useMemo } from "react";
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { ENDPOINT_MATIERE, MATIERE, STRUCTURE } from './def';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';


const matiereSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    coeff: z.number().min(0, "Le coefficient doit être positif"),
    heure: z.number().min(0, "Les heures doit être positive"),
    unite_enseignement_id: z.number(),
    color: z.string().nullable().optional(),
});

export type Matiere = z.infer<typeof matiereSchema>;

const MatiereFields = ({ register, errors, isReadOnly }: RenderProps<Matiere>) => (
    <>
        <TextField
            {...register("name")}
            label="Nom de la matière"
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />
        <TextField
            {...register("coeff", { valueAsNumber: true })}
            label="Coefficient"
            variant="outlined"
            fullWidth
            type="number"
            disabled={isReadOnly}
            error={!!errors.coeff}
            helperText={errors.coeff?.message}
            sx={{ mb: 2 }}
        />
        <TextField
            {...register("heure", { valueAsNumber: true })}
            label="Heures"
            variant="outlined"
            fullWidth
            type="number"
            disabled={isReadOnly}
            error={!!errors.heure}
            helperText={errors.heure?.message}
            sx={{ mb: 2 }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="body2" color="text.secondary">Couleur</Typography>
            <input
                type="color"
                {...register("color")}
                disabled={isReadOnly}
                style={{ width: 48, height: 36, cursor: isReadOnly ? 'default' : 'pointer', border: 'none', padding: 0 }}
            />
        </Box>
    </>
);

export const matiereColumns: MRT_ColumnDef<Matiere>[] = [
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
        accessorKey: 'coeff',
        header: 'Coeff',
    },
    {
        accessorKey: 'heure',
        header: 'Heures',
    },
]

export const createMatiereViewConfig = (ueId: string): ViewConfig<Matiere> => {
    return {
        schema: matiereSchema,
        emptyValue: { id: -1, version: -1, unite_enseignement_id: parseInt(ueId) },
        columns: matiereColumns,
        render: MatiereFields,
    }
};

// Partie statique : à l'extérieur du composant
export const createMatiereRepository = (ueId: string) => {
    return createRepository<Matiere>({
        endpoint: `${ENDPOINT_MATIERE}`,
        queryParams: `?unite_enseignement_id=${ueId}`,
        queryKey: [STRUCTURE, MATIERE, ueId],
        getId: (data: Matiere) => data.id,
    })
}

export function CrudMatiere({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Matiere>) {

    const { ueId } = useParams();
    const rootPath = useRootPath(mode);

    if (!ueId) return (
        <Typography>Le paramètre ueId est obligatoire</Typography>
    )

    const datasource = useMemo((): Datasource<Matiere> => ({
        ...createMatiereRepository(ueId),
        ...createMatiereViewConfig(ueId),
        title: "Matières",
        roleEcriture: Role.STRUCTURE_ECRITURE,
        isAction,
        isReadOnly,
        actionsLigne,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [ueId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}