import { z } from 'zod';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { Checkbox, FormControl, FormControlLabel, FormGroup, FormHelperText, FormLabel, TextField } from "@mui/material";
import { useMemo } from "react";
import { Crud } from "../../services/crud/Crud";
import { availableRoles, ENDPOINT_USER, Role, USER } from './def';
import type { ColumnDef } from '@tanstack/react-table';
import { useRootPath } from '../../services/crud/useRootPath';
import { messageValidation } from '../../i18n/validation';


const userSchema = z.object({
    id: z.number(),
    keycloak_id: z.string().nullish(),
    version: z.number(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.email({ error: messageValidation('emailInvalide') }).optional().or(z.literal('')),
    password: z.string().optional(),
    roles: z.union([
        z.string().transform((val) => val.split(',').map(r => r.trim()).filter(r => r !== '')),
        z.array(z.string())
    ]).optional(),
});

export type User = z.infer<typeof userSchema>;

const UserFields = ({ register, control, errors, isReadOnly }: RenderProps<User>) => {
    const { t } = useTranslation('user');
    return (
        <>
            <TextField
                {...register("firstName")}
                label={t('champs.prenom')}
                variant="outlined"
                fullWidth
                disabled={isReadOnly}
                error={!!errors.firstName}
                helperText={errors.firstName?.message}
                sx={{ mb: 2 }}
            />
            <TextField
                {...register("lastName")}
                label={t('champs.nom')}
                variant="outlined"
                fullWidth
                disabled={isReadOnly}
                error={!!errors.lastName}
                helperText={errors.lastName?.message}
                sx={{ mb: 2 }}
            />
            <TextField
                {...register("email")}
                label={t('champs.email')}
                variant="outlined"
                fullWidth
                disabled={isReadOnly}
                error={!!errors.email}
                helperText={errors.email?.message}
                sx={{ mb: 2 }}
            />
            {!isReadOnly && (
                <TextField
                    {...register("password")}
                    label={t('champs.motDePasse')}
                    type="password"
                    variant="outlined"
                    fullWidth
                    error={!!errors.password}
                    helperText={errors.password?.message}
                    sx={{ mb: 2 }}
                />
            )}
            <Controller
                name="roles"
                control={control}
                render={({ field }) => {
                    const currentRoles = Array.isArray(field.value) ? field.value : [];
                    return (
                        <FormControl component="fieldset" error={!!errors.roles} disabled={isReadOnly} sx={{ mb: 2, width: '100%' }}>
                            <FormLabel component="legend">{t('champs.roles')}</FormLabel>
                            <FormGroup row>
                                {availableRoles(t).map((role) => (
                                    <FormControlLabel
                                        key={role.id}
                                        control={
                                            <Checkbox
                                                checked={currentRoles.includes(role.id)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    const newRoles = checked
                                                        ? [...currentRoles, role.id]
                                                        : currentRoles.filter((r: string) => r !== role.id);
                                                    field.onChange(newRoles);
                                                }}
                                            />
                                        }
                                        label={role.label}
                                    />
                                ))}
                            </FormGroup>
                            {errors.roles && <FormHelperText>{errors.roles.message}</FormHelperText>}
                        </FormControl>
                    );
                }}
            />
        </>
    );
};

// Colonnes au format TanStack nu (lot 8) : leur forme aiguille `List.tsx`
// vers le nouveau socle `DataTable`.
function userColonnes(t: TFunction<'user'>): ColumnDef<User>[] {
    return [
        { accessorKey: 'id', header: t('colonnes.id') },
        { accessorKey: 'keycloak_id', header: t('colonnes.keycloakId') },
        { accessorKey: 'version', header: t('colonnes.version') },
        { accessorKey: 'firstName', header: t('colonnes.prenom') },
        { accessorKey: 'lastName', header: t('colonnes.nom') },
        { accessorKey: 'email', header: t('colonnes.email') },
        {
            accessorKey: 'roles',
            header: t('colonnes.roles'),
            cell: ({ cell }) => {
                const roles = cell.getValue<string[]>();
                return Array.isArray(roles) ? roles.map(r => availableRoles(t).find(ar => ar.id === r)?.label ?? r).join(', ') : '';
            }
        },
    ];
}

function userViewConfig(t: TFunction<'user'>): ViewConfig<User> {
    return {
        schema: userSchema,
        emptyValue: { id: -1, version: 0, keycloak_id: "-", roles: [] },
        colonnes: userColonnes(t),
        render: UserFields,
    };
}

// Partie statique : à l'extérieur du composant
const userDatasourceBase = createRepository<User>({
    endpoint: ENDPOINT_USER,
    queryKey: [USER],
    getId: (data: User) => data.id,
})


export function CrudUser({ mode, workflow, isAction, isTopToolbar, actionsBarreOutils }: CrudProps<User>) {

    const rootPath = useRootPath(mode);
    const { t: tCrud } = useTranslation('crud');
    const { t: tUser } = useTranslation('user');

    const datasource = useMemo((): Datasource<User> => ({
        ...userDatasourceBase,
        ...userViewConfig(tUser),
        title: tCrud('entites.user.title'),
        roleEcriture: Role.UTILISATEURS_ECRITURE,
        entityLabel: tCrud('entites.user.nom'),
        entityLabelAvecArticle: tCrud('entites.user.nomAvecArticle'),
        entityLabelPlural: tCrud('entites.user.nomPluriel'),
        isAction,
        isTopToolbar,
        actionsBarreOutils,
    }), [isAction, isTopToolbar, actionsBarreOutils, tCrud, tUser]);

    return (
        <Crud datasource={datasource} mode={mode} workflow={workflow} rootPath={rootPath} />
    )
}