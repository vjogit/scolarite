import { z } from 'zod';
import { useController, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { createRepository, type CrudProps, type Datasource, type RenderProps, type ViewConfig } from '../../services/crud/def';
import { useId, useMemo } from "react";
import { Crud } from "../../services/crud/Crud";
import { ChampTexte } from '../../services/ChampTexte';
import { Checkbox } from '../../components/ui/checkbox';
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '../../components/ui/field';
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

/**
 * Les rôles en cases à cocher — un groupe (`fieldset`/`legend`), pas un champ
 * partagé : seul cet écran en monte un. Le câblage suit celui de
 * `ChampTexte` (`useController`, erreur du champ affichée sous le groupe).
 */
function ChampRoles({ control, disabled }: { control: Control<User>; disabled: boolean }) {
    const { t } = useTranslation('user');
    const { field: { value, onChange }, fieldState } = useController({ name: 'roles', control });
    const id = useId();
    const roles = Array.isArray(value) ? value : [];
    const erreur = fieldState.error?.message;
    const estInvalide = erreur !== undefined;

    return (
        // `disabled:opacity-60` sur le groupe : la case Base UI est un <span>,
        // `disabled:` n'y prend jamais — en consultation les cases paraissaient
        // saisissables (constaté au navigateur). Le fieldset, lui, est un vrai
        // contrôle désactivé.
        <FieldSet disabled={disabled} data-invalid={estInvalide} className="mb-4 gap-2 disabled:opacity-60">
            <FieldLegend variant="label">{t('champs.roles')}</FieldLegend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
                {availableRoles(t).map((role) => (
                    <Field key={role.id} orientation="horizontal" className="w-auto">
                        <Checkbox
                            id={`${id}-${role.id}`}
                            checked={roles.includes(role.id)}
                            onCheckedChange={(coche) => {
                                onChange(coche ? [...roles, role.id] : roles.filter((r) => r !== role.id));
                            }}
                            disabled={disabled}
                        />
                        <FieldLabel htmlFor={`${id}-${role.id}`}>{role.label}</FieldLabel>
                    </Field>
                ))}
            </div>
            {estInvalide && <FieldError>{erreur}</FieldError>}
        </FieldSet>
    );
}

const UserFields = ({ control, isReadOnly }: RenderProps<User>) => {
    const { t } = useTranslation('user');
    return (
        <>
            <ChampTexte name="firstName" control={control} label={t('champs.prenom')} disabled={isReadOnly} />
            <ChampTexte name="lastName" control={control} label={t('champs.nom')} disabled={isReadOnly} />
            <ChampTexte name="email" control={control} label={t('champs.email')} disabled={isReadOnly} />
            {!isReadOnly && (
                <ChampTexte name="password" control={control} label={t('champs.motDePasse')} type="password" />
            )}
            <ChampRoles control={control} disabled={isReadOnly} />
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