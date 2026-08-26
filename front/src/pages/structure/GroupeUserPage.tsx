import { useParams, useNavigate } from 'react-router';
import { skipToken, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Box, Typography, IconButton, Tooltip, Button, darken } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import { MaterialReactTable, useMaterialReactTable, type MRT_ColumnDef, type MRT_Row } from 'material-react-table';
import { MRT_Localization_FR } from 'material-react-table/locales/fr';
import { MRT_Localization_EN } from 'material-react-table/locales/en';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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

function userColumns(t: TFunction<'structure'>): MRT_ColumnDef<User>[] {
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
    const { t, i18n: i18nInstance } = useTranslation('structure');

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

    const table = useMaterialReactTable<User>({
        columns: userColumns(t),
        data: members,
        localization: i18nInstance.language.startsWith('en') ? MRT_Localization_EN : MRT_Localization_FR,
        // Aucune création ici : on rattache un élève existant par le
        // sélecteur au-dessus de la table, il n'y a pas de route « /new ».
        renderEmptyRowsFallback: ({ table }) => (
            <EtatVideTable table={table} message={t('membres.aucunMembre')} />
        ),
        state: { isLoading },
        initialState: { density: 'compact' },
        enableRowActions: peutEcrire,
        positionActionsColumn: 'last',
        enableRowVirtualization: true,
        rowVirtualizerOptions: { overscan: 5 },
        enablePagination: false,
        renderRowActions: ({ row }: { row: MRT_Row<User> }) => (
            <Tooltip title={t('membres.retirer')}>
                <IconButton
                    // Hors contexte visuel, « Retirer du groupe » est le même
                    // nom sur toutes les lignes : il faut dire laquelle.
                    aria-label={t('membres.retirerAriaLabel', { nom: nomLisible(row.original) })}
                    size="small"
                    color="error"
                    disabled={removeMutation.isPending}
                    onClick={() => { removeMutation.mutate(row.original.id); }}
                >
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        ),
        enableTopToolbar: false,
        enableBottomToolbar: false,
        mrtTheme: (theme) => ({
            baseBackgroundColor: theme.palette.mode === 'dark' ?
                darken(theme.palette.background.default, 0.05) : theme.palette.background.default,
        }),
        enableStickyHeader: true,
        enableStickyFooter: true,
        muiTablePaperProps: {
            sx: {
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
            },
        },
        muiTableContainerProps: {
            sx: {
                flex: 1,
                overflow: 'auto',
            },
        },
    });

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1, flexShrink: 0 }}>
                <Tooltip title={t('commun.retour')}>
                    <IconButton aria-label={t('commun.retour')} onClick={() => { void navigate(-1); }}>
                        <ArrowBackIcon />
                    </IconButton>
                </Tooltip>
                <Typography variant="h6" sx={{ flex: 1 }}>{t('membres.titre')}</Typography>
                {peutEcrire && groupeId && <GroupeImportButton groupeId={groupeId} />}
            </Box>

            {peutEcrire && (
                <Box component="form" onSubmit={(event) => { void handleSubmit(onSubmit)(event); }} sx={{ mb: 2, flexShrink: 0 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                            <UserSelector
                                control={control}
                                errors={errors}
                                getValues={getValues}
                                setValue={setValue}
                            />
                        </Box>
                        <Button
                            type="submit"
                            variant="contained"
                            startIcon={<PersonAddIcon />}
                            disabled={addMutation.isPending}
                            sx={{ mt: 0.5 }}
                        >
                            {t('commun.ajouter')}
                        </Button>
                    </Box>
                </Box>
            )}

            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <MaterialReactTable table={table} />
            </Box>
        </Box>
    );
}
