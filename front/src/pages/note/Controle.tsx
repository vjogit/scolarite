import { z } from 'zod';
import { FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import type { ActionLigne } from "../../services/crud/actions";
import { useCallback, useMemo, useState } from "react";
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { Controller } from 'react-hook-form';
import { CONTROLE, ENDPOINT_CONTROLE, RESULTAT } from './def';
import { useRootPath } from '../../services/crud/useRootPath';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { FicheExportModal } from './FicheExportModal';
import { LIBELLE_IMPORT_FICHE, useFicheImport } from './FicheImportButton';
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
        endpoint: ENDPOINT_CONTROLE,
        queryParams: `?matiere_id=${matiereId}`,
        queryKey: [RESULTAT, CONTROLE, matiereId],

        getId: (data: Controle) => data.id,
    })
}
export function CrudControle({ mode, workflow, isAction, isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Controle>) {

    const { matiereId, optionId } = useParams();
    const rootPath = useRootPath(mode);

    const [exportOpen, setExportOpen] = useState(false);
    const [exportControleId, setExportControleId] = useState<number | null>(null);
    const { declencher: declencherImport, champ: champImport } = useFicheImport();

    const handleExportOpen = useCallback((controleId: number) => {
        setExportControleId(controleId);
        setExportOpen(true);
    }, []);

    // Les deux actions propres à l'écran : l'import écrit des notes, l'export
    // reste une lecture, offerte à tous.
    const actionsFiche: ActionLigne<Controle>[] = useMemo(() => [
        {
            id: 'import-fiche',
            libelle: LIBELLE_IMPORT_FICHE,
            icone: FileUploadIcon,
            exigeEcriture: true,
            onSelect: (controle) => { declencherImport(controle.id); },
        },
        {
            id: 'export-fiche',
            libelle: 'Exporter la fiche',
            icone: FileDownloadIcon,
            onSelect: (controle) => { handleExportOpen(controle.id); },
        },
    ], [declencherImport, handleExportOpen]);

    const datasource = useMemo((): Datasource<Controle> | null => matiereId ? ({
        ...createControleRepository(matiereId),
        ...createControleViewConfig(matiereId),
        title: "Contrôles",
        roleEcriture: Role.NOTES_ECRITURE,
        entityLabel: "le contrôle",
        entityLabelPlural: "contrôles",
        isAction,
        isTopToolbar,
        renderTopToolbarCustomActions,
        actionsLigne: [...(actionsLigne ?? []), ...actionsFiche],
    }) : null, [matiereId, isAction, isTopToolbar, renderTopToolbarCustomActions, actionsLigne, actionsFiche]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre matiereId est obligatoire</Typography>
    )

    return (
        <>
            <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
            {champImport}
            <FicheExportModal
                open={exportOpen}
                controleId={exportControleId}
                optionId={optionId ?? ''}
                onClose={() => { setExportOpen(false); }}
            />
        </>
    )
}