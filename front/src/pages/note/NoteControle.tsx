import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { z } from 'zod';
import { useWatch } from 'react-hook-form';
import { TextField, FormControlLabel, Switch, Typography, Box, Skeleton } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import { Controller } from 'react-hook-form';
import type { MRT_Cell, MRT_ColumnDef } from 'material-react-table';
import { NoteChartModal } from './NoteChartModal';
import { ENDPOINT_CONTROLE, ENDPOINT_NOTE_CONTROLE, NOTE } from './def';
import { UserSelector } from '../../services/UserSelector';
import { NoteChartButton, useNoteChart } from './NoteChartButton';
import { useRootPath } from '../../services/crud/useRootPath';
import { useQuery } from '@tanstack/react-query';
import { apiInstance } from '../../services/api';
import type { Controle } from './Controle';
import { bornesNote, createNoteField, libelleNote } from './noteField';
import { GrilleNotes } from './GrilleNotes';
import { Role } from '../user/def';

const createNoteControleSchema = (bareme?: number) => z.object({
    id: z.number(),
    version: z.number(),
    note: createNoteField(bareme),
    remarque: z.string().nullish(),
    is_validated: z.boolean().default(false),
    not_evaluated: z.boolean().default(false),
    controle_id: z.number(),
    user_id: z.number({
        message: "Veuillez sélectionner un élève"
    }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
}).refine(data => {
    const fkCount = [data.controle_id].filter(v => v != null).length;
    return fkCount === 1;
}, {
    message: "Une note doit être associée à exactement un élément (contrôle, matière, UE, ou période).",
    path: ["user_id"],
}).refine(data => {
    if (!data.not_evaluated && (data.note == null || isNaN(data.note))) return false;
    return true;
}, {
    message: "La note est obligatoire",
    path: ["note"],
});

export type NoteControle = z.infer<ReturnType<typeof createNoteControleSchema>>;

const createNoteMatiereFields = (isRattrapage: boolean, bareme?: number) =>
    ({ register, control, errors, isReadOnly, getValues, setValue }: RenderProps<NoteControle>) => {
        const notEvaluated = useWatch({ control, name: 'not_evaluated' });
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
                    label="Non évalué"
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
                        label="Validée"
                        sx={{ mb: 2, display: 'block' }}
                    />
                )}
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
    };

const createNoteMatiereColumns = (isRattrapage: boolean): MRT_ColumnDef<NoteControle>[] => [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'version', header: 'Version' },
    {
        accessorFn: (row) => `${row.lastName || ''} ${row.firstName || ''}`,
        header: 'Élève',
    },
    {
        accessorKey: 'note',
        header: 'Note',
        Cell: ({ cell, row }) => {
            if (row.original.not_evaluated) return 'N.E.';
            const valeur = cell.getValue<number | null>();
            return valeur != null ? valeur.toFixed(2) : '-';
        }
    },
    ...(isRattrapage ? [{
        accessorKey: 'is_validated' as const,
        header: 'Validée',
        Cell: ({ cell }: { cell: MRT_Cell<NoteControle> }) => cell.getValue() ? 'Oui' : 'Non',
    }] : []),
    { accessorKey: 'not_evaluated', header: 'Non évalué', Cell: ({ cell }: { cell: MRT_Cell<NoteControle> }) => cell.getValue() ? 'Oui' : '-' },
    { accessorKey: 'remarque', header: 'Remarque' },
];

const noteControleViewConfig = (controleId: string, isRattrapage: boolean, bareme?: number): ViewConfig<NoteControle> => {
    return {
        schema: createNoteControleSchema(bareme),
        emptyValue: { id: -1, version: -1, controle_id: parseInt(controleId), is_validated: false, not_evaluated: false, note: 0 },
        columns: createNoteMatiereColumns(isRattrapage),
        render: createNoteMatiereFields(isRattrapage, bareme),
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

    // Le contrôle porte is_rattrapage et le barème de sa promotion : un seul
    // appel, celui qui existait déjà, suffit à alimenter les deux.
    const { data: controle, isLoading: controleLoading } = useQuery<Controle>({
        queryKey: ['controle', controleId],
        queryFn: () => apiInstance.get<Controle>(`${ENDPOINT_CONTROLE}/${controleId}`).then(r => r.data),
        enabled: !!controleId,
    });

    const isRattrapage = controle?.is_rattrapage ?? false;
    const bareme = controle?.bareme;

    const datasource = useMemo((): Datasource<NoteControle> | null => controleId ? ({
        ...createNoteControleRepository(controleId),
        ...noteControleViewConfig(controleId, isRattrapage, bareme),
        title: "Notes du contrôle",
        roleEcriture: Role.NOTES_ECRITURE,
        isAction,
        actionsLigne,
        isTopToolbar,
        renderTopToolbarCustomActions: ({ table, defaultActions }) => (
            <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {defaultActions}
                <NoteChartButton onClick={() => { handleOpenChart(table); }} />
            </Box>
        )
    }) : null, [rootPath, workflow, isRattrapage, bareme]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!controleId || !datasource) return (
        <Typography>Le paramètre matiereId est obligatoire</Typography>
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