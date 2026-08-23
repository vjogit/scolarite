import { z } from 'zod';
import { createRepository, type DescriptionEntite } from '../../services/crud/def';
import { TextField, Typography } from "@mui/material";
import type { CrudProps, Datasource, RenderProps, ViewConfig } from "../../services/crud/def";
import type { ActionNavigation } from "../../services/crud/actions";
import { useMemo } from "react";
import { Crud } from "../../services/crud/Crud";
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useParams } from 'react-router';
import { Controller, type FieldValues } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import type { MRT_ColumnDef } from 'material-react-table';
import { ENDPOINT_PERIODE, PERIODE, STRUCTURE, UES, ENDPOINT_PERIODE_DELETE_IMPACT } from './def';
import { useRootPath } from '../../services/crud/useRootPath';
import { Role } from '../user/def';

const periodeSchema = z.object({
    id: z.number(),
    version: z.number(),
    name: z.string().min(1, "Le nom est requis"),
    debut: z.coerce.date(),
    fin: z.coerce.date(),
    option_id: z.number(),
}).refine((data) => data.fin > data.debut, {
    message: "La date de fin doit être postérieure à la date de début",
    path: ["fin"],
});

export type Periode = z.infer<typeof periodeSchema>;

const PeriodeFields = ({ register, control, errors, isReadOnly }: RenderProps<Periode>) => (
    <>
        <TextField
            {...register("name")}
            label="Nom de l'periode"
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
                            helperText: errors.debut?.message!,
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
                            helperText: errors.fin?.message!,
                            fullWidth: true
                        }
                    }}
                />
            )}
        />
    </>
);

const periodeColumns: MRT_ColumnDef<Periode>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'version', header: 'Version' },
    { accessorKey: 'name', header: 'Nom' },
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

const createPeriodeViewConfig = (optionId: string): ViewConfig<Periode> => {
    return {
        schema: periodeSchema,
        emptyValue: { id: -1, version: -1, option_id: parseInt(optionId) },
        columns: periodeColumns,
        render: PeriodeFields,
    }
};

// Partie statique : à l'extérieur du composant
export const createPeriodeRepository = (optionId: string) => {
    return createRepository<Periode>({
        endpoint: ENDPOINT_PERIODE,
        deleteImpactEndpoint: ENDPOINT_PERIODE_DELETE_IMPACT,
        queryParams: `?option_id=${optionId}`,
        queryKey: [STRUCTURE, PERIODE, optionId],
        getId: (data: Periode) => data.id,
    })
}

/** Descente vers les UE de la période. */
export const ACTION_UES: ActionNavigation<FieldValues> = {
    id: 'ues',
    libelle: 'Gérer les UE',
    icone: ListAltIcon,
    segment: UES,
};

/** Ce que la période est, quel que soit l'écran qui l'affiche. */
export const periodeEntite: DescriptionEntite = {
    title: "Périodes",
    roleEcriture: Role.STRUCTURE_ECRITURE,
    entityLabel: "la période",
    entityLabelPlural: "périodes",
    suppressionEnCorbeille: true,
};

export function CrudPeriode({ mode, workflow, isAction, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, isReadOnly }: CrudProps<Periode>) {

    const { optionId } = useParams();
    const rootPath = useRootPath(mode);

    const datasource = useMemo((): Datasource<Periode> | null => optionId ? ({
        ...createPeriodeRepository(optionId),
        ...createPeriodeViewConfig(optionId),
        ...periodeEntite,
        isAction,
        actionsLigne: actionsLigne ?? [ACTION_UES],
        isTopToolbar,
        renderTopToolbarCustomActions,
        isReadOnly,
    }) : null, [optionId, isAction, isTopToolbar, actionsLigne, renderTopToolbarCustomActions, isReadOnly]);

    // Le garde vient après les hooks, dont l'ordre doit être le même à chaque
    // rendu : sans le paramètre, le mémo ne construit rien.
    if (!datasource) return (
        <Typography>Le paramètre optionId est obligatoire</Typography>
    )

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
