import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { Crud } from "../../services/crud/Crud";
import { useParams } from 'react-router';
import { useMemo } from "react";
import { z } from 'zod';
import { TextField, FormControlLabel, Switch, MenuItem, Grid, Typography } from "@mui/material";
import { UserSelector } from '../../services/UserSelector';
import { Controller } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { ENDPOINT_MOBILITE } from './def';
import type { MRT_ColumnDef } from 'material-react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';

const TYPE_MOBILITE_OPTIONS = [
    "Stage",
    "Semestre académique",
    "Job d'été",
    "Autre",
];

const mobiliteSchema = z.object({
    id: z.number(),
    version: z.number(),
    user_id: z.number({ message: "Veuillez sélectionner un élève" }),
    pays: z.string().min(1, "Le pays est obligatoire"),
    ville: z.string().nullish(),
    type_mobilite: z.string().nullish(),
    date_debut: z.coerce.date({ message: "La date de début est obligatoire" }),
    date_fin: z.coerce.date({ message: "La date de fin est obligatoire" }),
    est_valide: z.boolean().default(false),
    remarque: z.string().nullish(),
    promotion_id: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
}).refine(data => {
    if (!data.date_debut || !data.date_fin) return true;
    return data.date_fin >= data.date_debut;
}, {
    message: "La date de fin doit être postérieure à la date de début",
    path: ["date_fin"],
});

type Mobilite = z.infer<typeof mobiliteSchema>;

const MobiliteFields = ({ register, control, errors, isReadOnly, getValues, setValue }: RenderProps<Mobilite>) => {
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
                    label="Pays"
                    fullWidth
                    disabled={isReadOnly}
                    error={!!errors.pays}
                    helperText={errors.pays?.message}
                    sx={{ mt: 2, mb: 2 }}
                />

                <TextField
                    {...register("ville")}
                    label="Ville"
                    fullWidth
                    disabled={isReadOnly}
                    error={!!errors.ville}
                    helperText={errors.ville?.message as string}
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
                            label="Type de mobilité"
                            fullWidth
                            disabled={isReadOnly}
                            error={!!errors.type_mobilite}
                            helperText={errors.type_mobilite?.message as string}
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
                            label="Date de début"
                            value={field.value ? dayjs(field.value) : null}
                            onChange={(newValue) => field.onChange(newValue ? newValue.toDate() : null)}
                            disabled={isReadOnly}
                            slotProps={{
                                textField: {
                                    error: !!errors.date_debut,
                                    helperText: errors.date_debut?.message as string,
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
                            label="Date de fin"
                            value={field.value ? dayjs(field.value) : null}
                            onChange={(newValue) => field.onChange(newValue ? newValue.toDate() : null)}
                            disabled={isReadOnly}
                            slotProps={{
                                textField: {
                                    error: !!errors.date_fin,
                                    helperText: errors.date_fin?.message as string,
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
                    label="Validée"
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
                    helperText={errors.remarque?.message as string}
                    sx={{ mb: 2 }}
                />
            </Grid>
        </Grid>
    );
};

const matiereColumns: MRT_ColumnDef<Mobilite>[] =
    [
        { accessorKey: 'id', header: 'ID' },
        { accessorKey: 'version', header: 'Version' },
        { accessorKey: 'lastName', header: 'Nom' },
        { accessorKey: 'firstName', header: 'Prénom' },
        { accessorKey: 'pays', header: 'Pays' },
        { accessorKey: 'ville', header: 'Ville' },
        { accessorKey: 'type_mobilite', header: 'Type' },
        {
            accessorKey: 'date_debut',
            header: 'Date début',
            Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
        {
            accessorKey: 'date_fin',
            header: 'Date fin',
            Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
        },
        {
            accessorKey: 'est_valide',
            header: 'Validée',
            Cell: ({ cell }) => cell.getValue<boolean>() ? 'Oui' : 'Non',
        },
    ]

export const createNotePeriodeViewConfig = (promotionId: string): ViewConfig<Mobilite> => {
    return {
        schema: mobiliteSchema,
        emptyValue: {
            id: -1,
            version: -1,
            promotion_id: parseInt(promotionId),
            est_valide: false,
        },
        columns: matiereColumns,
        render: MobiliteFields,
    }
};

// Partie statique : à l'extérieur du composant
export const createPeriodeRepository = (promotionId: string) => {
    return createRepository<Mobilite>({
        endpoint: `${ENDPOINT_MOBILITE}`,
        queryParams: `?promotion_id=${promotionId}`,
        queryKey: ['mobilite', promotionId],
        getId: (data: Mobilite) => data.id,
    })
}

export function CrudMobiliteInternationale({ mode, workflow, isAction, isTopToolbar, renderTopToolbarCustomActions }: CrudProps<Mobilite>) {

    const { promotionId } = useParams();
    const rootPath = useRootPath(mode);

    if (!promotionId) return (
        <Typography>Le paramètre promotionId est obligatoire</Typography>
    )

    const datasource = useMemo((): Datasource<Mobilite> => ({
        ...createPeriodeRepository(promotionId),
        ...createNotePeriodeViewConfig(promotionId),
        title: "Mobilité Internationale",
        roleEcriture: Role.CERTIFICATION_ECRITURE,
        isAction,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [rootPath, workflow]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
