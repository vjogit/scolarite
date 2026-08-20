import { z } from 'zod';
import { Box, FormControlLabel, IconButton, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import type { MRT_ColumnDef, MRT_Row, MRT_TableInstance } from 'material-react-table';
import { Controller } from 'react-hook-form';
import { ENDPOINT_CONTROLE } from './def';
import { useRootPath } from '../../services/crud/useRootPath';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { FicheExportModal } from './FicheExportModal';
import { FicheImportButton } from './FicheImportButton';
import { Role } from '../user/def';


const controleSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    coeff: z.preprocess(
        (val) => (Number.isNaN(val as number) ? undefined : val),
        z.number().nullable().optional()
    ),
    is_rattrapage: z.boolean().default(false),
    remarque: z.string().nullable().optional(),
    matiere_id: z.number(),
    // Renvoyé par GET /resultat/controle/{id} uniquement : le barème appartient
    // à la promotion, il n'est pas saisi ici. Optionnel car la liste des
    // contrôles d'une matière ne le rapporte pas.
    bareme: z.number().optional(),
});

export type Controle = z.infer<typeof controleSchema>;

const ControleFields = ({ register, control, errors, isReadOnly }: RenderProps<Controle>) => (
    <>
        <TextField
            {...register("name")}
            label="Nom du contrôle"
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
        <FormControlLabel
            control={
                <Controller
                    name="is_rattrapage"
                    control={control}
                    render={({ field }) => (
                        <Switch
                            {...field}
                            checked={field.value}
                            disabled={isReadOnly}
                        />
                    )}
                />
            }
            label="Rattrapage"
            sx={{ mb: 2, display: 'block' }}
        />
        <TextField
            {...register("remarque")}
            label="Remarque"
            variant="outlined"
            fullWidth
            multiline
            rows={4}
            disabled={isReadOnly}
            error={!!errors.remarque}
            helperText={errors.remarque?.message}
            sx={{ mb: 2 }}
        />
    </>
);

const controleColumns: MRT_ColumnDef<Controle>[] = [
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
        accessorKey: 'is_rattrapage',
        header: 'Rattrapage',
        Cell: ({ cell }) => cell.getValue<boolean>() ? 'Oui' : 'Non',
    },
    {
        accessorKey: 'remarque',
        header: 'Remarque',
    },
]

export const createControleViewConfig = (matiereId: string): ViewConfig<Controle> => {
    return {
        schema: controleSchema,
        emptyValue: { id: -1, version: -1, matiere_id: parseInt(matiereId), is_rattrapage: false },
        columns: controleColumns,
        render: ControleFields,
    }
};

// Partie statique : à l'extérieur du composant
export const createControleRepository = (matiereId: string) => {
    return createRepository<Controle>({
        endpoint: `${ENDPOINT_CONTROLE}`,
        queryParams: `?matiere_id=${matiereId}`,
        queryKey: ['controle', matiereId],

        getId: (data: Controle) => data.id,
    })
}
export function CrudControle({ mode, workflow, isAction, isTopToolbar, renderRowActions, renderTopToolbarCustomActions }: CrudProps<Controle>) {

    const { matiereId, optionId } = useParams();
    const rootPath = useRootPath(mode);

    const [exportOpen, setExportOpen] = useState(false);
    const [exportControleId, setExportControleId] = useState<number | null>(null);

    const handleExportOpen = useCallback((controleId: number) => {
        setExportControleId(controleId);
        setExportOpen(true);
    }, []);

    if (!matiereId) return (
        <Typography>Le paramètre matiereId est obligatoire</Typography>
    )

    const datasource = useMemo((): Datasource<Controle> => ({
        ...createControleRepository(matiereId),
        ...createControleViewConfig(matiereId),
        title: "Contrôles",
        roleEcriture: Role.NOTES_ECRITURE,
        isAction,
        isTopToolbar,
        renderTopToolbarCustomActions,
        renderRowActions: ({ row, table, defaultActions, peutEcrire }: { row: MRT_Row<Controle>, table: MRT_TableInstance<Controle>, defaultActions: ReactNode, peutEcrire: boolean }) => (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {renderRowActions ? renderRowActions({ row, table, defaultActions, peutEcrire }) : defaultActions}
                {/* L'import écrit des notes ; l'export reste une lecture. */}
                {peutEcrire && <FicheImportButton controleId={row.original.id} />}
                <Tooltip title="Exporter la fiche">
                    <IconButton onClick={() => handleExportOpen(row.original.id)}>
                        <FileDownloadIcon />
                    </IconButton>
                </Tooltip>
            </Box>
        ),
    }), [rootPath, workflow, renderRowActions, handleExportOpen]);

    return (
        <>
            <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
            <FicheExportModal
                open={exportOpen}
                controleId={exportControleId}
                optionId={optionId ?? ''}
                onClose={() => setExportOpen(false)}
            />
        </>
    )
}