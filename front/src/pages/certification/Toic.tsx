import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { TextField, Typography } from "@mui/material";
import { UserSelector } from '../../services/UserSelector';
import { Controller } from 'react-hook-form';
import { ChampDate } from '../../services/ChampDate';
import type { TFunction } from 'i18next';
import { ENDPOINT_TOEIC } from './def';
import type { ColumnDef } from '@tanstack/react-table';
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
    const { t } = useTranslation('certification');
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
                label={t('toic.champScore')}
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
                    // En création, react-hook-form donne `undefined` (le champ
                    // est absent d'`emptyValue`) : le garde qui empêche la
                    // date du jour de se pré-remplir vit dans `ChampDate`.
                    <ChampDate
                        label={t('toic.champDatePassage')}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isReadOnly}
                        error={!!errors.date_passage}
                        helperText={errors.date_passage?.message}
                        fullWidth
                    />
                )}
            />

            <TextField
                {...register("remarque")}
                label={t('toic.champRemarque')}
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

// Colonnes au format TanStack nu (lot 9) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function toeicColonnes(t: TFunction<'certification'>): ColumnDef<Toeic>[] {
    return [
        {
            accessorKey: 'id',
            header: t('toic.colonneId'),
        },
        {
            accessorKey: 'version',
            header: t('toic.colonneVersion'),
        },

        {
            accessorKey: 'lastName',
            header: t('toic.colonneNom'),
        },

        {
            accessorKey: 'firstName',
            header: t('toic.colonnePrenom'),
        },

        { accessorKey: 'score', header: t('toic.colonneScore') },

        {
            accessorKey: 'date_passage',
            header: t('toic.colonneDatePassage'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
    ];
}

const createToeicViewConfig = (promotionId: string, t: TFunction<'certification'>): ViewConfig<Toeic> => {
    return {
        schema: toeicSchema,
        emptyValue: { id: -1, version: -1, promotion_id: parseInt(promotionId) },
        colonnes: toeicColonnes(t),
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

export function CrudToeic({ mode, workflow, isAction, isTopToolbar, actionsBarreOutils }: CrudProps<Toeic>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t: tCrud } = useTranslation('crud');
    const { t: tCertification } = useTranslation('certification');

    const datasource = useMemo((): Datasource<Toeic> | null => promotionId ? ({
        ...toeicDatasourceBase(promotionId),
        ...createToeicViewConfig(promotionId, tCertification),
        title: tCrud('entites.toic.title'),
        roleEcriture: Role.CERTIFICATION_ECRITURE,
        entityLabel: tCrud('entites.toic.nom'),
        entityLabelAvecArticle: tCrud('entites.toic.nomAvecArticle'),
        entityLabelPlural: tCrud('entites.toic.nomPluriel'),
        isAction,
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [promotionId, isAction, isTopToolbar, actionsBarreOutils, tCrud, tCertification]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tCertification('parametrePromotionIdObligatoire')}</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}


