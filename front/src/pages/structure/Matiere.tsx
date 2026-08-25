import { Box, TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { matiereSchema, type Matiere, createMatiereRepository, matiereEntite } from './entites/matiere';

export type { Matiere } from './entites/matiere';

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

const matiereColumns: MRT_ColumnDef<Matiere>[] = [
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

const createMatiereViewConfig = (ueId: string): ViewConfig<Matiere> => {
    return {
        schema: matiereSchema,
        emptyValue: { id: -1, version: -1, unite_enseignement_id: parseInt(ueId) },
        columns: matiereColumns,
        render: MatiereFields,
    }
};

export function CrudMatiere({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Matiere>) {

    const { ueId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');

    const datasource = useMemo((): Datasource<Matiere> | null => ueId ? ({
        ...createMatiereRepository(ueId),
        ...createMatiereViewConfig(ueId),
        ...matiereEntite(t),
        isAction,
        isReadOnly,
        actionsLigne,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }) : null, [ueId, isAction, isReadOnly, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, t]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre ueId est obligatoire</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
