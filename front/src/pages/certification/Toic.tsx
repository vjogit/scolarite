import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { TextField, Typography } from "@mui/material";
import { UserSelector } from '../../services/UserSelector';
import { Controller } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { ENDPOINT_TOEIC } from './def';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';
import { messageValidation } from '../../i18n/validation';

// Schéma de validation pour le TOEIC
const toeicSchema = z.object({
    id: z.number(),
    version: z.number(),
    user_id: z.number({ error: messageValidation('selectionnerEleve') }),
    score: z.number().min(0).max(990, { error: messageValidation('scoreToeicPlage') }),
    date_passage: z.coerce.date(),
    remarque: z.string().nullish(),
    promotion_id: z.number().optional(),
});

export type Toeic = z.infer<typeof toeicSchema>;

// Formulaire d'édition
const ToeicFields = ({ register, control, errors, isReadOnly, getValues, setValue }: RenderProps<Toeic>) => {
    return (
        <>
            <UserSelector
                control={control}
                errors={errors}
                getValues={getValues}
                setValue={setValue}
                isReadOnly={isReadOnly}
            />
            <TextField
                {...register("score", { valueAsNumber: true })}
                label="Score"
                type="number"
                disabled={isReadOnly}
                fullWidth
                error={!!errors.score}
                helperText={errors.score?.message}
                sx={{ mb: 2 }}
            />
            <Controller
                name="date_passage"
                control={control}
                render={({ field }) => (
                    <DatePicker
                        label="Date de passage"
                        // Le schéma type ce champ `Date`, mais `emptyValue` ne le contient
                        // pas : en création, react-hook-form donne `undefined`. Et
                        // `dayjs(undefined)` rend l'heure courante, pas une date
                        // invalide — sans ce garde, le formulaire s'ouvre avec la date
                        // du jour pré-remplie. Vérifié au navigateur.
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        value={field.value ? dayjs(field.value) : null}
                        onChange={(newValue) => {
                            field.onChange(newValue ? newValue.toDate() : null);
                        }}
                        disabled={isReadOnly}
                        slotProps={{
                            textField: {
                                error: !!errors.date_passage,
                                helperText: errors.date_passage?.message,
                                fullWidth: true
                            }
                        }}
                    />
                )}
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
};

const toeicColumns: MRT_ColumnDef<Toeic>[] = [
    {
        accessorKey: 'id',
        header: 'ID',
    },
    {
        accessorKey: 'version',
        header: 'Version',
    },

    {
        accessorKey: 'lastName',
        header: 'Nom',
    },

    {
        accessorKey: 'firstName',
        header: 'Prénom',
    },

    { accessorKey: 'score', header: 'Score' },

    {
        accessorKey: 'date_passage',
        header: 'Date passage',
        Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
    },
]

const createToeicViewConfig = (promotionId: string): ViewConfig<Toeic> => {
    return {
        schema: toeicSchema,
        emptyValue: { id: -1, version: -1, promotion_id: parseInt(promotionId) },
        columns: toeicColumns,
        render: ToeicFields,
    }
};

// Partie statique : à l'extérieur du composant
const toeicDatasourceBase = (promotionId: string) => {
    return createRepository<Toeic>({
        endpoint: ENDPOINT_TOEIC,
        queryParams: `?promotion_id=${promotionId}`,
        queryKey: ['toeic', promotionId],
        getId: (data: Toeic) => data.id,
    })
}

export function CrudToeic({ mode, workflow, isAction, isTopToolbar, renderTopToolbarCustomActions }: CrudProps<Toeic>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');

    const datasource = useMemo((): Datasource<Toeic> | null => promotionId ? ({
        ...toeicDatasourceBase(promotionId),
        ...createToeicViewConfig(promotionId),
        title: t('entites.toic.title'),
        roleEcriture: Role.CERTIFICATION_ECRITURE,
        entityLabel: t('entites.toic.nom'),
        entityLabelAvecArticle: t('entites.toic.nomAvecArticle'),
        entityLabelPlural: t('entites.toic.nomPluriel'),
        isAction,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }) : null, [promotionId, isAction, isTopToolbar, renderTopToolbarCustomActions, t]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre promotionId est obligatoire</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}


