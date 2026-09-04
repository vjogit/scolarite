import { useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { skipToken, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Trash2, UserPlus } from 'lucide-react';
import type { ColumnDef, Table as TableTanstack } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { DataTable } from '../../services/crud/DataTable';
import { useEtatTablePersistant } from '../../services/crud/usePersistentTableState';
import { EtatVideTable } from '../../services/crud/EtatVideTable';
import { apiInstance } from '../../services/api';
import { ENDPOINT_GROUPE, STRUCTURE } from './def';
import { UserSelector } from '../../services/UserSelector';
import { GroupeImportButton } from './GroupeImportButton';
import { notifyError } from '../../services/notify';
import { messageForError } from '../../services/errorMessages';
import { useDroits } from '../../services/context/droits';
import { Role } from '../user/def';

interface User {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
}

interface AddUserForm {
    id: number;
    user_id: number | null;
    firstName: string;
    lastName: string;
}

const ADD_USER_DEFAULT: AddUserForm = { id: -1, user_id: null, firstName: '', lastName: '' };

/** Nom affichable d'un membre, pour les noms accessibles des actions. */
function nomLisible(user: User): string {
    const nom = [user.firstName, user.lastName].filter(Boolean).join(' ');
    if (nom.length > 0) return nom;
    if (user.email !== null && user.email.length > 0) return user.email;
    return `#${String(user.id)}`;
}

// Colonnes au format TanStack nu (lot 8) : cet écran monte `DataTable` en
// direct — il ne passe pas par `List`, il n'a ni cycle CRUD ni datasource.
function userColonnes(t: TFunction<'structure'>): ColumnDef<User>[] {
    return [
        { accessorKey: 'lastName', header: t('commun.nom') },
        { accessorKey: 'firstName', header: t('commun.prenom') },
        { accessorKey: 'email', header: t('commun.email') },
    ];
}

export function GroupeUserPage() {
    const { groupeId } = useParams<{ groupeId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { t } = useTranslation('structure');

    // Lister les membres est une lecture ; ajouter, retirer et importer
    // écrivent la structure.
    const { possedeRole } = useDroits();
    const peutEcrire = possedeRole(Role.STRUCTURE_ECRITURE);

    const { control, handleSubmit, setValue, getValues, reset, formState: { errors } } =
        useForm<AddUserForm>({ defaultValues: ADD_USER_DEFAULT });

    const { data: members = [], isLoading } = useQuery<User[]>({
        queryKey: [STRUCTURE,'groupe-users', groupeId],
        queryFn: groupeId
            ? async () => {
                const res = await apiInstance.get<User[]>(`${ENDPOINT_GROUPE}/${groupeId}/user`);
                return res.data;
            }
            : skipToken,
    });

    // Même clé que la requête : l'état de table est persisté par groupe.
    const etat = useEtatTablePersistant([STRUCTURE, 'groupe-users', groupeId]);

    const addMutation = useMutation({
        mutationFn: (userId: number) =>
            apiInstance.post(`${ENDPOINT_GROUPE}/${groupeId ?? ''}/user`, { user_id: userId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: [STRUCTURE, 'groupe-users', groupeId] });
            reset(ADD_USER_DEFAULT);
        },
        onError: (error) => { notifyError(messageForError(error)); },
    });

    const removeMutation = useMutation({
        mutationFn: (userId: number) =>
            apiInstance.delete(`${ENDPOINT_GROUPE}/${groupeId ?? ''}/user/${userId}`),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: [STRUCTURE, 'groupe-users', groupeId] });
        },
        onError: (error) => { notifyError(messageForError(error)); },
    });

    const onSubmit = (data: AddUserForm) => {
        if (data.user_id) addMutation.mutate(data.user_id);
    };

    const colonnes = useMemo(() => userColonnes(t), [t]);
    const getRowId = useCallback((user: User) => String(user.id), []);

    const { mutate: retirer, isPending: retraitEnCours } = removeMutation;
    const actionsLigne = useCallback((user: User) => (
        <Tooltip>
            <TooltipTrigger
                render={(
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        // Hors contexte visuel, « Retirer du groupe » est le même
                        // nom sur toutes les lignes : il faut dire laquelle.
                        aria-label={t('membres.retirerAriaLabel', { nom: nomLisible(user) })}
                        className="text-destructive hover:text-destructive"
                        disabled={retraitEnCours}
                        onClick={() => { retirer(user.id); }}
                    />
                )}
            >
                <Trash2 />
            </TooltipTrigger>
            <TooltipContent>{t('membres.retirer')}</TooltipContent>
        </Tooltip>
    ), [retirer, retraitEnCours, t]);

    // Aucune création ici : on rattache un élève existant par le
    // sélecteur au-dessus de la table, il n'y a pas de route « /new ».
    const etatVide = useCallback((table: TableTanstack<User>) => (
        <EtatVideTable table={table} message={t('membres.aucunMembre')} />
    ), [t]);

    return (
        <div className="flex h-full flex-col p-4">
            <div className="mb-4 flex shrink-0 items-center gap-2">
                <Tooltip>
                    <TooltipTrigger
                        render={(
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t('commun.retour')}
                                onClick={() => { void navigate(-1); }}
                            />
                        )}
                    >
                        <ArrowLeft />
                    </TooltipTrigger>
                    <TooltipContent>{t('commun.retour')}</TooltipContent>
                </Tooltip>
                {/* `h6` : le rang que MUI donnait à `variant="h6"`. */}
                <h6 className="m-0 flex-1 text-lg font-medium">{t('membres.titre')}</h6>
                {peutEcrire && groupeId && <GroupeImportButton groupeId={groupeId} />}
            </div>

            {peutEcrire && (
                <form onSubmit={(event) => { void handleSubmit(onSubmit)(event); }} className="mb-2 shrink-0">
                    {/* Le sélecteur porte son libellé au-dessus du champ et sa
                        marge basse : le bouton s'aligne sur le bas du champ. */}
                    <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                            <UserSelector
                                control={control}
                                errors={errors}
                                getValues={getValues}
                                setValue={setValue}
                            />
                        </div>
                        <Button type="submit" disabled={addMutation.isPending} className="mb-4">
                            <UserPlus />
                            {t('commun.ajouter')}
                        </Button>
                    </div>
                </form>
            )}

            <div className="min-h-0 flex-1 overflow-hidden">
                <DataTable<User>
                    colonnes={colonnes}
                    donnees={members}
                    enChargement={isLoading}
                    etat={etat}
                    getRowId={getRowId}
                    actionsLigne={peutEcrire ? actionsLigne : undefined}
                    etatVide={etatVide}
                />
            </div>
        </div>
    );
}
