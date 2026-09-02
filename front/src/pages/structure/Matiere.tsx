import { Box, TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { matiereSchema, type Matiere, createMatiereRepository, matiereEntite } from './entites/matiere';

export type { Matiere } from './entites/matiere';

const MatiereFields = ({ register, errors, isReadOnly }: RenderProps<Matiere>) => {
    const { t } = useTranslation('structure');
    return (
        <>
            <TextField
                {...register("name")}
                label={t('matiere.champNom')}
                variant="outlined"
                fullWidth
                disabled={isReadOnly}
                error={!!errors.name}
                helperText={errors.name?.message}
                sx={{ mb: 2 }}
            />
            <TextField
                {...register("coeff", { valueAsNumber: true })}
                label={t('matiere.champCoefficient')}
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
                label={t('matiere.champHeures')}
                variant="outlined"
                fullWidth
                type="number"
                disabled={isReadOnly}
                error={!!errors.heure}
                helperText={errors.heure?.message}
                sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary">{t('matiere.champCouleur')}</Typography>
                <input
                    type="color"
                    {...register("color")}
                    disabled={isReadOnly}
                    style={{ width: 48, height: 36, cursor: isReadOnly ? 'default' : 'pointer', border: 'none', padding: 0 }}
                />
            </Box>
        </>
    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function matiereColonnes(t: TFunction<'structure'>): ColumnDef<Matiere>[] {
    return [
        {
            accessorKey: 'id',
            header: t('commun.id'),
        },
        {
            accessorKey: 'version',
            header: t('commun.version'),
        },
        {
            accessorKey: 'name',
            header: t('commun.nom'),
        },
        {
            accessorKey: 'coeff',
            header: t('matiere.colonneCoeff'),
        },
        {
            accessorKey: 'heure',
            header: t('matiere.champHeures'),
        },
    ];
}

function createMatiereViewConfig(ueId: string, t: TFunction<'structure'>): ViewConfig<Matiere> {
    return {
        schema: matiereSchema,
        emptyValue: { id: -1, version: -1, unite_enseignement_id: parseInt(ueId) },
        colonnes: matiereColonnes(t),
        render: MatiereFields,
    }
}

export function CrudMatiere({ mode, workflow, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Matiere>) {

    const { ueId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Matiere> | null => ueId ? ({
        ...createMatiereRepository(ueId),
        ...createMatiereViewConfig(ueId, tStructure),
        ...matiereEntite(t),
        isAction,
        isReadOnly,
        actionsLigne,
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [ueId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tStructure('matiere.erreurUeIdObligatoire')}</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
