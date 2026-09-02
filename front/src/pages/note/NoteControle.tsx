import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { z } from 'zod';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { TextField, FormControlLabel, Switch, Typography, Box, Skeleton } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import { Controller } from 'react-hook-form';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { NoteChartModal } from './NoteChartModal';
import { ENDPOINT_CONTROLE, ENDPOINT_NOTE_CONTROLE, NOTE } from './def';
import { UserSelector } from '../../services/UserSelector';
import { NoteChartButton } from './NoteChartButton';
import { useNoteChart } from './useNoteChart';
import { useRootPath } from '../../services/crud/useRootPath';
import { skipToken, useQuery } from '@tanstack/react-query';
import { apiInstance } from '../../services/api';
import type { Controle } from './Controle';
import { bornesNote, createNoteField, libelleNote } from './noteField';
import { GrilleNotes } from './GrilleNotes';
import { Role } from '../user/def';
import { messageValidation } from '../../i18n/validation';

const createNoteControleSchema = (bareme?: number) => z.object({
    id: z.number(),
    version: z.number(),
    note: createNoteField(bareme),
    remarque: z.string().nullish(),
    is_validated: z.boolean().default(false),
    not_evaluated: z.boolean().default(false),
    controle_id: z.number(),
    user_id: z.number({
        error: messageValidation('selectionnerEleve')
    }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
// `controle_id` est le seul rattachement de ce schéma, et il est obligatoire :
// le contrôle « exactement une clé étrangère » qui vivait ici comptait toujours
// un, et ne pouvait donc rien refuser.
}).refine(data => {
    if (!data.not_evaluated && (data.note == null || isNaN(data.note))) return false;
    return true;
}, {
    error: messageValidation('noteObligatoire'),
    path: ["note"],
});

export type NoteControle = z.infer<ReturnType<typeof createNoteControleSchema>>;

const createNoteControleFields = (isRattrapage: boolean, bareme?: number) =>
    ({ register, control, errors, isReadOnly, getValues, setValue }: RenderProps<NoteControle>) => {
        const notEvaluated = useWatch({ control, name: 'not_evaluated' });
        const { t } = useTranslation('note');
        return (
            <>
                <UserSelector
                    control={control}
                    errors={errors}
                    getValues={getValues}
                    setValue={setValue}
                    isReadOnly={isReadOnly}
                />

                <FormControlLabel
                    control={
                        <Controller
                            name="not_evaluated"
                            control={control}
                            render={({ field }) => (
                                <Switch
                                    {...field}
                                    checked={field.value}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                        field.onChange(e);
                                        if (e.target.checked) setValue('note', null);
                                    }}
                                />
                            )}
                        />
                    }
                    label={t('noteControle.nonEvalueLabel')}
                    sx={{ mb: 2, display: 'block' }}
                />

                <TextField
                    {...register("note", { valueAsNumber: true })}
                    label={libelleNote(bareme)}
                    variant="outlined"
                    fullWidth
                    type="number"
                    disabled={isReadOnly || notEvaluated}
                    error={!!errors.note}
                    helperText={errors.note?.message}
                    slotProps={{ htmlInput: { step: "0.01", ...bornesNote(bareme) } }}
                    sx={{ mb: 2 }}
                />
                {isRattrapage && (
                    <FormControlLabel
                        control={
                            <Controller
                                name="is_validated"
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
                        label={t('noteControle.valideeLabel')}
                        sx={{ mb: 2, display: 'block' }}
                    />
                )}
                <TextField
                    {...register("remarque")}
                    label={t('noteControle.remarqueLabel')}
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

const createNoteControleColonnes = (isRattrapage: boolean, t: TFunction<'note'>): ColumnDef<NoteControle>[] => [
    { accessorKey: 'id', header: t('noteControle.colonneId') },
    { accessorKey: 'version', header: t('noteControle.colonneVersion') },
    {
        accessorFn: (row) => `${row.lastName ?? ''} ${row.firstName ?? ''}`,
        header: t('noteControle.colonneEleve'),
    },
    {
        accessorKey: 'note',
        header: t('commun.note'),
        cell: ({ cell, row }) => {
            if (row.original.not_evaluated) return t('noteControle.nonEvalueAbrege');
            const valeur = cell.getValue<number | null>();
            return valeur != null ? valeur.toFixed(2) : '-';
        }
    },
    ...(isRattrapage ? [{
        accessorKey: 'is_validated' as const,
        header: t('noteControle.colonneValidee'),
        cell: ({ cell }: CellContext<NoteControle, unknown>) => cell.getValue() ? t('commun.oui') : t('commun.non'),
    }] : []),
    { accessorKey: 'not_evaluated', header: t('noteControle.colonneNonEvalue'), cell: ({ cell }: CellContext<NoteControle, unknown>) => cell.getValue() ? t('commun.oui') : '-' },
    { accessorKey: 'remarque', header: t('noteControle.colonneRemarque') },
];

const noteControleViewConfig = (controleId: string, isRattrapage: boolean, t: TFunction<'note'>, bareme?: number): ViewConfig<NoteControle> => {
    return {
        schema: createNoteControleSchema(bareme),
        emptyValue: { id: -1, version: -1, controle_id: parseInt(controleId), is_validated: false, not_evaluated: false, note: 0 },
        colonnes: createNoteControleColonnes(isRattrapage, t),
        render: createNoteControleFields(isRattrapage, bareme),
    }
};
const createNoteControleRepository = (controleId: string) => {
    return createRepository<NoteControle>({
        endpoint: ENDPOINT_NOTE_CONTROLE,
        queryParams: `?controle_id=${controleId}`,
        queryKey: [NOTE, 'controle', controleId],
        getId: (data: NoteControle) => data.id,
    })
}

export function CrudNoteControle({ mode, workflow, isAction, isTopToolbar, actionsLigne }: CrudProps<NoteControle>) {

    const { controleId, optionId } = useParams();
    const { chartOpen, setChartOpen, chartData, handleOpenChart } = useNoteChart<NoteControle>();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('note');

    // Le contrôle porte is_rattrapage et le barème de sa promotion : un seul
    // appel, celui qui existait déjà, suffit à alimenter les deux.
    const { data: controle, isLoading: controleLoading } = useQuery<Controle>({
        queryKey: ['controle', controleId],
        queryFn: controleId
            ? () => apiInstance.get<Controle>(`${ENDPOINT_CONTROLE}/${controleId}`).then(r => r.data)
            : skipToken,
    });

    const isRattrapage = controle?.is_rattrapage ?? false;
    const bareme = controle?.bareme;

    const datasource = useMemo((): Datasource<NoteControle> | null => controleId ? ({
        ...createNoteControleRepository(controleId),
        ...noteControleViewConfig(controleId, isRattrapage, t, bareme),
        title: t('noteControle.titreNotesDuControle'),
        roleEcriture: Role.NOTES_ECRITURE,
        isAction,
        actionsLigne,
        isTopToolbar,
        actionsBarreOutils: ({ defaultActions, lignesVisibles }) => (
            <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {defaultActions}
                <NoteChartButton onClick={() => { handleOpenChart(lignesVisibles); }} />
            </Box>
        )
    }) : null, [controleId, isRattrapage, bareme, isAction, isTopToolbar, actionsLigne, handleOpenChart, t]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!controleId || !datasource) return (
        <Typography>{t('noteControle.parametreControleIdObligatoire')}</Typography>
    )

    // On attend le contrôle avant de monter le formulaire : sans le barème, le
    // schéma validerait sur la seule borne basse et le champ annoncerait une
    // plage qu'on ne connaît pas encore. C'est aussi ce qui évite que les
    // colonnes changent après coup, une fois is_rattrapage connu.
    if (controleLoading) return <Skeleton variant="rounded" height={400} />;

    // La liste des notes du contrôle laisse place à la grille de saisie : elle
    // était alimentée par les notes existantes, la grille l'est par l'effectif.
    // Les autres modes restent servis par le formulaire page entière, qui garde
    // sa route et son fil d'Ariane pour l'édition détaillée d'une note.
    if (mode === 'list') {
        return (
            <GrilleNotes
                controleId={controleId}
                optionId={optionId}
                controle={controle}
                isRattrapage={isRattrapage}
                bareme={bareme}
            />
        );
    }

    return (
        <>
            <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
            <NoteChartModal open={chartOpen} onClose={() => { setChartOpen(false); }} data={chartData} />
        </>
    )
}