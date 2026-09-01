import { FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import type { ActionLigne } from '../../services/crud/actions';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crud } from '../../services/crud/Crud';
import { useParams } from 'react-router';
import type { MRT_ColumnDef } from 'material-react-table';
import { Controller } from 'react-hook-form';
import { useRootPath } from '../../services/crud/useRootPath';
import { FileDown, Upload } from 'lucide-react';
import type { TFunction } from 'i18next';
import { FicheExportModal } from './FicheExportModal';
import { useFicheImport, libelleImportFiche } from './useFicheImport';
import { Role } from '../user/def';
import { controleSchema, type Controle, createControleRepository } from './entites/controle';

export type { Controle } from './entites/controle';

const ControleFields = ({ register, control, errors, isReadOnly }: RenderProps<Controle>) => {
    const { t } = useTranslation('note');
    return (
        <>
            <TextField
                {...register("name")}
                label={t('controle.nomLabel')}
                variant="outlined"
                fullWidth
                disabled={isReadOnly}
                error={!!errors.name}
                helperText={errors.name?.message}
                sx={{ mb: 2 }}
            />
            <TextField
                {...register("coeff", { valueAsNumber: true })}
                label={t('controle.coefficientLabel')}
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
                label={t('controle.rattrapageLabel')}
                sx={{ mb: 2, display: 'block' }}
            />
            <TextField
                {...register("remarque")}
                label={t('controle.remarqueLabel')}
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
};

function controleColumns(t: TFunction<'note'>): MRT_ColumnDef<Controle>[] {
    return [
        {
            accessorKey: 'id',
            header: t('controle.colonneId'),
        },
        {
            accessorKey: 'version',
            header: t('controle.colonneVersion'),
        },
        {
            accessorKey: 'name',
            header: t('controle.colonneNom'),
        },
        {
            accessorKey: 'coeff',
            header: t('controle.colonneCoeff'),
        },
        {
            accessorKey: 'is_rattrapage',
            header: t('controle.colonneRattrapage'),
            Cell: ({ cell }) => cell.getValue<boolean>() ? t('commun.oui') : t('commun.non'),
        },
        {
            accessorKey: 'remarque',
            header: t('controle.colonneRemarque'),
        },
    ];
}

const createControleViewConfig = (matiereId: string, t: TFunction<'note'>): ViewConfig<Controle> => {
    return {
        schema: controleSchema,
        emptyValue: { id: -1, version: -1, matiere_id: parseInt(matiereId), is_rattrapage: false },
        columns: controleColumns(t),
        render: ControleFields,
    }
};
export function CrudControle({ mode, workflow, isAction, isTopToolbar, actionsLigne, renderTopToolbarCustomActions }: CrudProps<Controle>) {

    const { matiereId, optionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t: tCrud } = useTranslation('crud');
    const { t: tNote } = useTranslation('note');

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
            libelle: libelleImportFiche(tNote),
            icone: Upload,
            exigeEcriture: true,
            onSelect: (controle) => { declencherImport(controle.id); },
        },
        {
            id: 'export-fiche',
            libelle: tNote('controle.exporterLaFiche'),
            icone: FileDown,
            onSelect: (controle) => { handleExportOpen(controle.id); },
        },
    ], [declencherImport, handleExportOpen, tNote]);

    const datasource = useMemo((): Datasource<Controle> | null => matiereId ? ({
        ...createControleRepository(matiereId),
        ...createControleViewConfig(matiereId, tNote),
        title: tCrud('entites.controle.title'),
        roleEcriture: Role.NOTES_ECRITURE,
        entityLabel: tCrud('entites.controle.nom'),
        entityLabelAvecArticle: tCrud('entites.controle.nomAvecArticle'),
        entityLabelPlural: tCrud('entites.controle.nomPluriel'),
        isAction,
        isTopToolbar,
        renderTopToolbarCustomActions,
        actionsLigne: [...(actionsLigne ?? []), ...actionsFiche],
    }) : null, [matiereId, isAction, isTopToolbar, renderTopToolbarCustomActions, actionsLigne, actionsFiche, tCrud, tNote]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tNote('controle.parametreMatiereIdObligatoire')}</Typography>
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
