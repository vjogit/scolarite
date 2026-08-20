import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Box, Typography, IconButton, Tooltip, Button, darken } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import { MaterialReactTable, useMaterialReactTable, type MRT_ColumnDef, type MRT_Row } from 'material-react-table';
import { apiInstance } from '../../services/api';
import { ENDPOINT_GROUPE, STRUCTURE } from './def';
import { UserSelector } from '../../services/UserSelector';
import { GroupeImportButton } from './GroupeImportButton';
import { useDroits } from '../../services/context/droits';
import { Role } from '../user/def';

interface User {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
}

type AddUserForm = {
    id: number;
    user_id: number | null;
    firstName: string;
    lastName: string;
};

const ADD_USER_DEFAULT: AddUserForm = { id: -1, user_id: null, firstName: '', lastName: '' };

const userColumns: MRT_ColumnDef<User>[] = [
    { accessorKey: 'lastName', header: 'Nom' },
    { accessorKey: 'firstName', header: 'Prénom' },
    { accessorKey: 'email', header: 'Email' },
];

export function GroupeUserPage() {
    const { groupeId } = useParams<{ groupeId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Lister les membres est une lecture ; ajouter, retirer et importer
    // écrivent la structure.
    const { possedeRole } = useDroits();
    const peutEcrire = possedeRole(Role.STRUCTURE_ECRITURE);

    const { control, handleSubmit, setValue, getValues, reset, formState: { errors } } =
        useForm<AddUserForm>({ defaultValues: ADD_USER_DEFAULT });

    const { data: members = [], isLoading } = useQuery<User[]>({
        queryKey: [STRUCTURE,'groupe-users', groupeId],
        queryFn: async () => {
            const res = await apiInstance.get<User[]>(`${ENDPOINT_GROUPE}/${groupeId}/user`);
            return res.data;
        },
    });

    const addMutation = useMutation({
        mutationFn: (userId: number) =>
            apiInstance.post(`${ENDPOINT_GROUPE}/${groupeId}/user`, { user_id: userId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['groupe-users', groupeId] });
            reset(ADD_USER_DEFAULT);
        },
    });

    const removeMutation = useMutation({
        mutationFn: (userId: number) =>
            apiInstance.delete(`${ENDPOINT_GROUPE}/${groupeId}/user/${userId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['groupe-users', groupeId] });
        },
    });

    const onSubmit = (data: AddUserForm) => {
        if (data.user_id) addMutation.mutate(data.user_id);
    };

    const table = useMaterialReactTable<User>({
        columns: userColumns,
        data: members,
        state: { isLoading },
        initialState: { density: 'compact' },
        enableRowActions: peutEcrire,
        positionActionsColumn: 'last',
        enableRowVirtualization: true,
        rowVirtualizerOptions: { overscan: 5 },
        enablePagination: false,
        renderRowActions: ({ row }: { row: MRT_Row<User> }) => (
            <Tooltip title="Retirer du groupe">
                <IconButton
                    size="small"
                    color="error"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(row.original.id)}
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
                <Tooltip title="Retour">
                    <IconButton onClick={() => navigate(-1)}>
                        <ArrowBackIcon />
                    </IconButton>
                </Tooltip>
                <Typography variant="h6" sx={{ flex: 1 }}>Membres du groupe</Typography>
                {peutEcrire && <GroupeImportButton groupeId={groupeId!} />}
            </Box>

            {peutEcrire && (
                <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mb: 2, flexShrink: 0 }}>
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
                            Ajouter
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
