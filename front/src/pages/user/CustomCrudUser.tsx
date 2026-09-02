/**
 * L'écran des utilisateurs tel que son workflow le monte.
 *
 * Dans son propre module : un composant défini à côté d'exports qui n'en
 * sont pas empêche le remplacement à chaud.
 */

import { Box } from '@mui/material';
import type { ActionsBarreOutilsProps } from '../../services/crud/def';
import type { CrudComponentProps } from '../../services/crud/routes';
import { USER_WORKFLOW } from './def';
import { CrudUser, type User } from './User';
import { UserImportButton } from './UserImport';

export function CustomCrudUser({ mode }: CrudComponentProps) {

    const barreOutils = ({ defaultActions, peutEcrire }: ActionsBarreOutilsProps<User>) => (
        <Box sx={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {defaultActions}
            {/* Import : composant React autonome avec ses propres hooks */}
            {peutEcrire && <UserImportButton />}
        </Box>
    )
    return <CrudUser
        workflow={USER_WORKFLOW}
        mode={mode}
        isAction={true}
        isTopToolbar={true}
        actionsBarreOutils={barreOutils}
    />;
}
