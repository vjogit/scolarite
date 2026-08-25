import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { TextField, FormControlLabel, Switch, MenuItem, Grid, Typography } from "@mui/material";
import { UserSelector } from '../../services/UserSelector';
import { Controller } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import { ENDPOINT_MOBILITE } from './def';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';
import { messageValidation } from '../../i18n/validation';

// Valeurs stockées telles quelles en base (pas d'identifiant séparé du
// libellé) : contrairement à `type_salle`, ce champ ne peut pas se traduire à
// l'affichage sans faire diverger la valeur soumise de la donnée existante.
// Laissé en français, hors du périmètre de cette migration.
const TYPE_MOBILITE_OPTIONS = [
    "Stage",
    "Semestre académique",
    "Job d'été",
    "Autre",
];

const mobiliteSchema = z.object({
    id: z.number(),
    version: z.number(),
    user_id: z.number({ error: messageValidation('selectionnerEleve') }),
    pays: z.string().min(1, { error: messageValidation('paysRequis') }),
    ville: z.string().nullish(),
    type_mobilite: z.string().nullish(),
    date_debut: z.coerce.date({ error: messageValidation('dateDebutRequise') }),
    date_fin: z.coerce.date({ error: messageValidation('dateFinRequise') }),
    est_valide: z.boolean().default(false),
    remarque: z.string().nullish(),
    promotion_id: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
}).refine(data => {
    // `refine` ne s'exécute qu'après une analyse réussie : les deux dates sont
    // donc présentes et valides. Le garde qui les testait ici ne se déclenchait
    // jamais.
    return data.date_fin >= data.date_debut;
}, {
    error: messageValidation('dateFinApresDebut'),
    path: ["date_fin"],
});

type Mobilite = z.infer<typeof mobiliteSchema>;

const MobiliteFields = ({ register, control, errors, isReadOnly, getValues, setValue }: RenderProps<Mobilite>) => {
    const { t } = useTranslation('certification');
    return (
        <Grid container spacing={8}>
            {/* COLONNE GAUCHE */}
            <Grid size={{ xs: 12, md: 6 }}>
                <UserSelector
                    control={control}
                    errors={errors}
                    getValues={getValues}
                    setValue={setValue}
                    isReadOnly={isReadOnly}
                />

                <TextField
                    {...register("pays")}
                    label={t('mobilite.champPays')}
                    fullWidth
                    disabled={isReadOnly}
                    error={!!errors.pays}
                    helperText={errors.pays?.message}
                    sx={{ mt: 2, mb: 2 }}
                />

                <TextField
                    {...register("ville")}
                    label={t('mobilite.champVille')}
                    fullWidth
                    disabled={isReadOnly}
                    error={!!errors.ville}
                    helperText={errors.ville?.message}
                    sx={{ mb: 2 }}
                />
            </Grid>

            {/* COLONNE DROITE */}
            <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                    name="type_mobilite"
                    control={control}
                    render={({ field }) => (
                        <TextField
                            {...field}
                            select
                            label={t('mobilite.champTypeMobilite')}
                            fullWidth
                            disabled={isReadOnly}
                            error={!!errors.type_mobilite}
                            helperText={errors.type_mobilite?.message}
                            value={field.value ?? ""}
                            sx={{ mb: 2 }}
                        >
                            {TYPE_MOBILITE_OPTIONS.map((option) => (
                                <MenuItem key={option} value={option}>
                                    {option}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                />

                <Controller
                    name="date_debut"
                    control={control}
                    render={({ field }) => (
                        <DatePicker
                            label={t('mobilite.champDateDebut')}
                            // Le schéma type ce champ `Date`, mais `emptyValue` ne le contient
                            // pas : en création, react-hook-form donne `undefined`. Et
                            // `dayjs(undefined)` rend l'heure courante, pas une date
                            // invalide — sans ce garde, le formulaire s'ouvre avec la date
                            // du jour pré-remplie. Vérifié au navigateur.
                            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                            value={field.value ? dayjs(field.value) : null}
                            onChange={(newValue) => { field.onChange(newValue ? newValue.toDate() : null); }}
                            disabled={isReadOnly}
                            slotProps={{
                                textField: {
                                    error: !!errors.date_debut,
                                    helperText: errors.date_debut?.message,
                                    fullWidth: true,
                                    sx: { mb: 2 },
                                }
                            }}
                        />
                    )}
                />

                <Controller
                    name="date_fin"
                    control={control}
                    render={({ field }) => (
                        <DatePicker
                            label={t('mobilite.champDateFin')}
                            // Le schéma type ce champ `Date`, mais `emptyValue` ne le contient
                            // pas : en création, react-hook-form donne `undefined`. Et
                            // `dayjs(undefined)` rend l'heure courante, pas une date
                            // invalide — sans ce garde, le formulaire s'ouvre avec la date
                            // du jour pré-remplie. Vérifié au navigateur.
                            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                            value={field.value ? dayjs(field.value) : null}
                            onChange={(newValue) => { field.onChange(newValue ? newValue.toDate() : null); }}
                            disabled={isReadOnly}
                            slotProps={{
                                textField: {
                                    error: !!errors.date_fin,
                                    helperText: errors.date_fin?.message,
                                    fullWidth: true,
                                    sx: { mb: 2 },
                                }
                            }}
                        />
                    )}
                />
            </Grid>

            {/* PLEINE LARGEUR */}
            <Grid size={{ xs: 12 }}>
                <FormControlLabel
                    control={
                        <Controller
                            name="est_valide"
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
                    label={t('mobilite.champValidee')}
                    sx={{ mb: 2, display: 'block' }}
                />

                <TextField
                    {...register("remarque")}
                    label={t('mobilite.champRemarque')}
                    variant="outlined"
                    fullWidth
                    multiline
                    rows={4}
                    disabled={isReadOnly}
                    error={!!errors.remarque}
                    helperText={errors.remarque?.message}
                    sx={{ mb: 2 }}
                />
            </Grid>
        </Grid>
    );
};

function mobiliteColumns(t: TFunction<'certification'>): MRT_ColumnDef<Mobilite>[] {
    return [
        { accessorKey: 'id', header: t('mobilite.colonneId') },
        { accessorKey: 'version', header: t('mobilite.colonneVersion') },
        { accessorKey: 'lastName', header: t('mobilite.colonneNom') },
        { accessorKey: 'firstName', header: t('mobilite.colonnePrenom') },
        { accessorKey: 'pays', header: t('mobilite.colonnePays') },
        { accessorKey: 'ville', header: t('mobilite.colonneVille') },
        { accessorKey: 'type_mobilite', header: t('mobilite.colonneType') },
        {
            accessorKey: 'date_debut',
            header: t('mobilite.colonneDateDebut'),
            Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
        {
            accessorKey: 'date_fin',
            header: t('mobilite.colonneDateFin'),
            Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
        {
            accessorKey: 'est_valide',
            header: t('mobilite.colonneValidee'),
            Cell: ({ cell }) => cell.getValue<boolean>() ? t('commun.oui') : t('commun.non'),
        },
    ];
}

const createMobiliteViewConfig = (promotionId: string, t: TFunction<'certification'>): ViewConfig<Mobilite> => {
    return {
        schema: mobiliteSchema,
        emptyValue: {
            id: -1,
            version: -1,
            promotion_id: parseInt(promotionId),
            est_valide: false,
        },
        columns: mobiliteColumns(t),
        render: MobiliteFields,
    }
};

// Partie statique : à l'extérieur du composant
const createMobiliteRepository = (promotionId: string) => {
    return createRepository<Mobilite>({
        endpoint: ENDPOINT_MOBILITE,
        queryParams: `?promotion_id=${promotionId}`,
        queryKey: ['mobilite', promotionId],
        getId: (data: Mobilite) => data.id,
    })
}

export function CrudMobiliteInternationale({ mode, workflow, isAction, isTopToolbar, renderTopToolbarCustomActions }: CrudProps<Mobilite>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);
    const { t: tCrud } = useTranslation('crud');
    const { t: tCertification } = useTranslation('certification');

    const datasource = useMemo((): Datasource<Mobilite> | null => promotionId ? ({
        ...createMobiliteRepository(promotionId),
        ...createMobiliteViewConfig(promotionId, tCertification),
        title: tCrud('entites.mobiliteInternationale.title'),
        roleEcriture: Role.CERTIFICATION_ECRITURE,
        entityLabel: tCrud('entites.mobiliteInternationale.nom'),
        entityLabelAvecArticle: tCrud('entites.mobiliteInternationale.nomAvecArticle'),
        entityLabelPlural: tCrud('entites.mobiliteInternationale.nomPluriel'),
        entityGender: 'f',
        isAction,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }) : null, [promotionId, isAction, isTopToolbar, renderTopToolbarCustomActions, tCrud, tCertification]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>{tCertification('parametrePromotionIdObligatoire')}</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
