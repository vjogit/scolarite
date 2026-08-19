import { z } from 'zod'; // Import de Zod
import { TextField, Tooltip, IconButton, FormControlLabel, Switch, Typography, Box } from "@mui/material";
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from "../../services/crud/def";
import { useMemo, useCallback, type ReactNode } from "react";
import { Crud } from "../../services/crud/Crud";
import { Controller, useWatch } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useNavigate, useParams } from 'react-router';
import type { MRT_ColumnDef, MRT_Row } from 'material-react-table';
import { ECHELLE_KEYS, IsValidEchelle } from './service';
import { ENDPOINT_PROMOTION, OPTION, PROMOTION, STRUCTURE, ENDPOINT_PROMOTION_DELETE_IMPACT } from './def';
import { useRootPath } from '../../services/crud/useRootPath';

const echelleRegexReelsLettresFixes = /^(a=[0-9]+(\.[0-9]+)?)(,b=[0-9]+(\.[0-9]+)?)(,c=[0-9]+(\.[0-9]+)?)(,d=[0-9]+(\.[0-9]+)?)(,e=[0-9]+(\.[0-9]+)?)(,f=[0-9]+(\.[0-9]+)?)$/;
const erreurEchelle_gpa = "Le format n'est pas correct (ex: a=4,b=3.5,c=3,d=2.5,e=2,f=0)" 
const echelleRegexReelsLettresFixesUe = /^(a=[0-9]+(\.[0-9]+)?)(,b=[0-9]+(\.[0-9]+)?)(,c=[0-9]+(\.[0-9]+)?)(,d=[0-9]+(\.[0-9]+)?)(,e=[0-9]+(\.[0-9]+)?)$/;
const erreurEchelleUe = "Le format n'est pas correct (ex: a=16.0,b=14.0,c=12.0,d=10.0,e=8.0)" 

const promotionSchema = z.object({
    id: z.number(), // L'ID est optionnel car absent lors de la création
    version: z.number(), // L'ID est optionnel car absent lors de la création
    name: z.string().min(1, "Le nom est requis"),
    debut: z.coerce.date(),
    fin: z.coerce.date(),
    echelle_gpa: z.union([
        z.string().superRefine((echelle, ctx) => {
            const error = IsValidEchelle(echelle, echelleRegexReelsLettresFixes, erreurEchelle_gpa);
            if (error) {
                ctx.addIssue({
                    code: "custom",
                    message: error,
                });
            }
        }).transform((val) => val.split(',').map(part => parseFloat(part.split('=')[1]))),
        z.array(z.number())
    ]),
    echelle: z.union([
        z.string().superRefine((echelle, ctx) => {
            const error = IsValidEchelle(echelle, echelleRegexReelsLettresFixesUe, erreurEchelleUe);
            if (error) {
                ctx.addIssue({
                    code: "custom",
                    message: error,
                });
            }
        }).transform((val) => val.split(',').map(part => parseFloat(part.split('=')[1]))),
        z.array(z.number())
    ]),
    bareme: z.number({ message: "Le barème est requis" })
        .positive("Le barème doit être strictement positif"),
    matiere_eliminatoire: z.boolean().nullable().optional(),
    value_matiere_eliminatoire: z.number().min(0, "La note doit être positive").nullable().optional(),
    formation_id: z.number(),
}).refine((data) => data.fin > data.debut, {
    message: "La date de fin doit être postérieure à la date de début",
    path: ["fin"], // L'erreur sera attachée au champ 'fin'
}).refine((data) => {
    if (data.matiere_eliminatoire) {
        return data.value_matiere_eliminatoire != null;
    }
    return true;
}, {
    message: "La note éliminatoire est requise si l'option est activée.",
    path: ["value_matiere_eliminatoire"],
}).refine((data) => {
    // Miroir de la contrainte SQL chk_promotion_echelle_bareme. echelle est déjà
    // validée décroissante par ailleurs : son premier seuil en est le maximum.
    const seuils = Array.isArray(data.echelle) ? data.echelle : [];
    return seuils.length === 0 || seuils[0] <= data.bareme;
}, {
    message: "Les seuils de l'échelle ne peuvent pas dépasser le barème",
    path: ["echelle"],
});

export type Promotion = z.infer<typeof promotionSchema>;

const PromotionFields = ({ register, control, errors, isReadOnly }: RenderProps<Promotion>) => {
    const matiereEliminatoire = useWatch({ control, name: 'matiere_eliminatoire' });

    return <>
        <TextField
            {...register("name")}
            label="Titre de la promotion"
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
                <DatePicker
                    label="Date de début"
                    value={field.value ? dayjs(field.value) : null}
                    onChange={(newValue) => {
                        field.onChange(newValue ? newValue.toDate() : null);
                    }}
                    disabled={isReadOnly}
                    slotProps={{
                        textField: {
                            error: !!errors.debut,
                            helperText: errors.debut?.message as string,
                            fullWidth: true
                        }
                    }}
                />
            )}
        />

        <Controller
            name="fin"
            control={control}
            render={({ field }) => (
                <DatePicker
                    label="Date de fin"
                    value={field.value ? dayjs(field.value) : null}
                    onChange={(newValue) => {
                        field.onChange(newValue ? newValue.toDate() : null);
                    }}
                    disabled={isReadOnly}
                    slotProps={{
                        textField: {
                            error: !!errors.fin,
                            helperText: errors.fin?.message as string,
                            fullWidth: true
                        }
                    }}
                />
            )}
        />

        <Controller
            name="echelle_gpa"
            control={control}
            render={({ field }) => {
                // Conversion Array (API) -> String (Affichage)
                const displayValue = Array.isArray(field.value)
                    ? field.value.map((v, i) => `${ECHELLE_KEYS[i]}=${v}`).join(',')
                    : field.value;

                return (
                    <TextField
                        {...field}
                        value={displayValue ?? ''}
                        label="Echelle GPA"
                        variant="outlined"
                        fullWidth
                        disabled={isReadOnly}
                        error={!!errors.echelle_gpa}
                        helperText={errors.echelle_gpa?.message as string}
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
                    ? field.value.map((v, i) => `${ECHELLE_KEYS[i]}=${v}`).join(',')
                    : field.value;
                return (
                    <TextField
                        {...field}
                        value={displayValue ?? ''}
                        label="Echelle"
                        variant="outlined"
                        fullWidth
                        disabled={isReadOnly}
                        error={!!errors.echelle}
                        helperText={errors.echelle?.message as string}
                        sx={{ mb: 2 }}
                    />
                );
            }}
        />

        <TextField
            {...register("bareme", { valueAsNumber: true })}
            label="Barème"
            variant="outlined"
            fullWidth
            type="number"
            disabled={isReadOnly}
            error={!!errors.bareme}
            helperText={errors.bareme?.message ?? "Note maximale de la promotion. Les seuils de l'échelle s'expriment sur ce barème."}
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
            label="Matière éliminatoire"
            sx={{ mb: 2, display: 'block' }}
        />

        {matiereEliminatoire && (
            <TextField
                {...register("value_matiere_eliminatoire", { valueAsNumber: true })}
                label="Note éliminatoire"
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

export const promotionColumns: MRT_ColumnDef<Promotion>[] = [
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
        accessorKey: 'debut',
        header: 'Début',
        Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
    },

    {
        accessorKey: 'fin',
        header: 'Fin',
        Cell: ({ cell }) => new Date(cell.getValue<Date>()).toLocaleDateString(),
    },
  
]

export const createPromotionViewConfig = (formationId: string): ViewConfig<Promotion> => {
    return {
        schema: promotionSchema,
        emptyValue: { id: -1, version: -1, formation_id: parseInt(formationId), bareme: 20 },
        columns: promotionColumns,
        render: PromotionFields,
    }
}

// Partie statique : à l'extérieur du composant
export const createPromotionRepository = (formationId: string) => {
    return createRepository<Promotion>({
        endpoint: `${ENDPOINT_PROMOTION}`,
        deleteImpactEndpoint: `${ENDPOINT_PROMOTION_DELETE_IMPACT}`,
        queryKey: [STRUCTURE, PROMOTION, formationId],
        queryParams: `?formation_id=${formationId}`,
        getId: (data: Promotion) => data.id,
    });
}

export function PromotionDefaultAction({ promotionId, rootPath }: { promotionId: number, rootPath: string }) {
    const navigate = useNavigate();
    return (
        <Tooltip title="Gérer les options">
            <IconButton onClick={() => navigate(`${rootPath}/${promotionId}/${OPTION}`)}>
                <ListAltIcon />
            </IconButton>
        </Tooltip>
    );
}


export function CrudPromotion({ mode, workflow, isAction, isReadOnly,isTopToolbar, renderRowActions, renderTopToolbarCustomActions }: CrudProps<Promotion>) {

    const { formationId } = useParams();
    const rootPath = useRootPath(mode);

    if (!formationId) return (
        <Typography>Le paramètre formationId est obligatoire</Typography>
    )

    const defaultRenderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Promotion>, defaultActions: ReactNode }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <PromotionDefaultAction promotionId={row.getValue('id')} rootPath={rootPath} />
        </Box>
    ), [rootPath]);

    const datasource = useMemo((): Datasource<Promotion> => ({
        ...createPromotionRepository(formationId),
        ...createPromotionViewConfig(formationId),
        title: "Promotions",
        entityLabel: "la promotion",
        entityLabelPlural: "promotions",
        deleteRequiresNameConfirmation: true,
        isAction,
        isReadOnly,
        renderRowActions: renderRowActions ? renderRowActions : defaultRenderRowActions,
        isTopToolbar,
        renderTopToolbarCustomActions,
    }), [rootPath, workflow, defaultRenderRowActions]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath}/>
    )
}
