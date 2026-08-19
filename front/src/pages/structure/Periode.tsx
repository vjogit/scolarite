import { z } from 'zod';
import { createRepository } from '../../services/crud/def';
import { TextField, Box, Tooltip, IconButton, Typography } from "@mui/material";
import type { CrudProps, Datasource, RenderProps, ViewConfig } from "../../services/crud/def";
import { useMemo, useCallback, type ReactNode } from "react";
import { Crud } from "../../services/crud/Crud";
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useNavigate, useParams } from 'react-router';
import { Controller } from 'react-hook-form';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import type { MRT_ColumnDef, MRT_Row } from 'material-react-table';
import { ENDPOINT_PERIODE, PERIODE, STRUCTURE, UES, ENDPOINT_PERIODE_DELETE_IMPACT } from './def';
import { useRootPath } from '../../services/crud/useRootPath';

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
    </>
);

export const periodeColumns: MRT_ColumnDef<Periode>[] = [
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

export const createPeriodeViewConfig = (optionId: string): ViewConfig<Periode> => {
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
        endpoint: `${ENDPOINT_PERIODE}`,
        deleteImpactEndpoint: `${ENDPOINT_PERIODE_DELETE_IMPACT}`,
        queryParams: `?option_id=${optionId}`,
        queryKey: [STRUCTURE, PERIODE, optionId],
        getId: (data: Periode) => data.id,
    })
}

export function PeriodeDefaultAction({ periodeId, rootPath }: { periodeId: number, rootPath: string }) {
    const navigate = useNavigate();
    return (
        <Tooltip title="Gérer les Ues">
            <IconButton onClick={() => navigate(`/${rootPath}/${periodeId}/${UES}`)}>
                <ListAltIcon />
            </IconButton>
        </Tooltip>
    );
}

export function CrudPeriode({ mode, workflow, isAction, isTopToolbar, renderRowActions, renderTopToolbarCustomActions, isReadOnly }: CrudProps<Periode>) {

    const { optionId } = useParams();
    const rootPath = useRootPath(mode);

    if (!optionId) return (
        <Typography>Le paramètre optionId est obligatoire</Typography>
    )

    const defaultRenderRowActions = useCallback(({ row, defaultActions }: { row: MRT_Row<Periode>, defaultActions: ReactNode }): ReactNode => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            <PeriodeDefaultAction periodeId={row.getValue('id')} rootPath={rootPath} />
        </Box>
    ), [rootPath]);

    const datasource = useMemo((): Datasource<Periode> => ({
        ...createPeriodeRepository(optionId),
        ...createPeriodeViewConfig(optionId),
        title: "Periodes",
        deleteEntityLabel: "la période",
        deleteEntityLabelPlural: "périodes",
        isAction,
        renderRowActions: renderRowActions ? renderRowActions : defaultRenderRowActions,
        isTopToolbar,
        renderTopToolbarCustomActions,
        isReadOnly,
    }), [optionId, isAction, isTopToolbar, renderRowActions, renderTopToolbarCustomActions, defaultRenderRowActions, isReadOnly]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}
