import { TextField, FormControlLabel, Switch, Typography } from '@mui/material';
import type { CrudProps, Datasource, RenderProps, ViewConfig } from '../../services/crud/def';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crud } from '../../services/crud/Crud';
import { Controller, useWatch } from 'react-hook-form';
import { ChampDate } from '../../services/ChampDate';
import { useParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ECHELLE_KEYS } from './service';
import { useRootPath } from '../../services/crud/useRootPath';
import { promotionSchema, type Promotion, createPromotionRepository, ACTION_OPTIONS, promotionEntite } from './entites/promotion';

export type { Promotion } from './entites/promotion';



const PromotionFields = ({ register, control, errors, isReadOnly }: RenderProps<Promotion>) => {
    const matiereEliminatoire = useWatch({ control, name: 'matiere_eliminatoire' });
    const { t } = useTranslation('structure');

    return <>
        <TextField
            {...register("name")}
            label={t('promotion.champTitre')}
            variant="outlined"
            fullWidth
            disabled={isReadOnly}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 2 }}
        />
        <Controller
            name="debut"
            control={control}
            render={({ field }) => (
                // En création, react-hook-form donne `undefined` (le champ est
                // absent d'`emptyValue`) : le garde qui empêche la date du
                // jour de se pré-remplir vit dans `ChampDate`, une fois pour
                // toutes.
                <ChampDate
                    label={t('commun.dateDebut')}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isReadOnly}
                    error={!!errors.debut}
                    helperText={errors.debut?.message}
                    fullWidth
                />
            )}
        />

        <Controller
            name="fin"
            control={control}
            render={({ field }) => (
                <ChampDate
                    label={t('commun.dateFin')}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isReadOnly}
                    error={!!errors.fin}
                    helperText={errors.fin?.message}
                    fullWidth
                />
            )}
        />

        <Controller
            name="echelle_gpa"
            control={control}
            render={({ field }) => {
                // Conversion Array (API) -> String (Affichage)
                const displayValue = Array.isArray(field.value)
                    ? field.value.map((v, i) => `${ECHELLE_KEYS[i] ?? ''}=${v}`).join(',')
                    : field.value;

                return (
                    <TextField
                        {...field}
                        // `emptyValue` ne porte pas ce champ : en création il vaut
                        // `undefined`, et `value={undefined}` ferait basculer le
                        // TextField en non contrôlé — React s'en plaint et la saisie
                        // peut se perdre. Le repli est ce qui le garde contrôlé.
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        value={displayValue ?? ''}
                        label={t('promotion.champEchelleGpa')}
                        variant="outlined"
                        fullWidth
                        disabled={isReadOnly}
                        error={!!errors.echelle_gpa}
                        helperText={errors.echelle_gpa?.message}
                        sx={{ mb: 2 }}
                    />
                );
            }}
        />

        <Controller
            name="echelle"
            control={control}
            render={({ field }) => {
                const displayValue = Array.isArray(field.value)
                    ? field.value.map((v, i) => `${ECHELLE_KEYS[i] ?? ''}=${v}`).join(',')
                    : field.value;
                return (
                    <TextField
                        {...field}
                        // `emptyValue` ne porte pas ce champ : en création il vaut
                        // `undefined`, et `value={undefined}` ferait basculer le
                        // TextField en non contrôlé — React s'en plaint et la saisie
                        // peut se perdre. Le repli est ce qui le garde contrôlé.
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        value={displayValue ?? ''}
                        label={t('promotion.champEchelle')}
                        variant="outlined"
                        fullWidth
                        disabled={isReadOnly}
                        error={!!errors.echelle}
                        helperText={errors.echelle?.message}
                        sx={{ mb: 2 }}
                    />
                );
            }}
        />

        <TextField
            {...register("bareme", { valueAsNumber: true })}
            label={t('promotion.champBareme')}
            variant="outlined"
            fullWidth
            type="number"
            disabled={isReadOnly}
            error={!!errors.bareme}
            helperText={errors.bareme?.message ?? t('promotion.baremeAide')}
            slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
            sx={{ mb: 2 }}
        />

        <FormControlLabel
            control={
                <Controller
                    name="matiere_eliminatoire"
                    control={control}
                    render={({ field }) => (
                        <Switch
                            {...field}
                            checked={field.value === null ? undefined : field.value}
                            disabled={isReadOnly}
                        />
                    )}
                />
            }
            label={t('promotion.champMatiereEliminatoire')}
            sx={{ mb: 2, display: 'block' }}
        />

        {matiereEliminatoire && (
            <TextField
                {...register("value_matiere_eliminatoire", { valueAsNumber: true })}
                label={t('promotion.champNoteEliminatoire')}
                variant="outlined"
                fullWidth
                type="number"
                disabled={isReadOnly}
                error={!!errors.value_matiere_eliminatoire}
                helperText={errors.value_matiere_eliminatoire?.message}
                slotProps={{ htmlInput: { step: "0.01" } }}
                sx={{ mb: 2 }}
            />
        )}
    </>
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function promotionColonnes(t: TFunction<'structure'>): ColumnDef<Promotion>[] {
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
            accessorKey: 'debut',
            header: t('commun.debut'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },

        {
            accessorKey: 'fin',
            header: t('commun.fin'),
            cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },

    ];
}

function createPromotionViewConfig(formationId: string, t: TFunction<'structure'>): ViewConfig<Promotion> {
    return {
        schema: promotionSchema,
        emptyValue: { id: -1, version: -1, formation_id: parseInt(formationId), bareme: 20 },
        colonnes: promotionColonnes(t),
        render: PromotionFields,
    }
}

export function CrudPromotion({ mode, workflow, isAction, isReadOnly,isTopToolbar, actionsLigne, actionsBarreOutils }: CrudProps<Promotion>) {

    const { formationId } = useParams();
    const rootPath = useRootPath(mode);
    const { t } = useTranslation('crud');
    const { t: tStructure } = useTranslation('structure');

    const datasource = useMemo((): Datasource<Promotion> | null => formationId ? ({
        ...createPromotionRepository(formationId),
        ...createPromotionViewConfig(formationId, tStructure),
        ...promotionEntite(t),
        isAction,
        isReadOnly,
        actionsLigne: actionsLigne ?? [ACTION_OPTIONS(t)],
        isTopToolbar,
        actionsBarreOutils,
    }) : null, [formationId, isAction, isReadOnly, isTopToolbar, actionsLigne, actionsBarreOutils, t, tStructure]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tStructure('promotion.erreurFormationIdObligatoire')}</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
