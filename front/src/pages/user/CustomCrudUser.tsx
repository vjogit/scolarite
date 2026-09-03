/**
 * L'écran des utilisateurs tel que son workflow le monte.
 *
 * Dans son propre module : un composant défini à côté d'exports qui n'en
 * sont pas empêche le remplacement à chaud.
 */

import type { ActionsBarreOutilsProps } from '../../services/crud/def';
import type { CrudComponentProps } from '../../services/crud/routes';
import { USER_WORKFLOW } from './def';
import { CrudUser, type User } from './User';
import { UserImportButton } from './UserImport';

export function CustomCrudUser({ mode }: CrudComponentProps) {

    const barreOutils = ({ defaultActions, peutEcrire }: ActionsBarreOutilsProps<User>) => (
        <div className="flex items-center gap-4">
            {defaultActions}
            {/* Import : composant React autonome avec ses propres hooks */}
            {peutEcrire && <UserImportButton />}
        </div>
    )
    return <CrudUser
        workflow={USER_WORKFLOW}
        mode={mode}
        isAction={true}
        isTopToolbar={true}
        actionsBarreOutils={barreOutils}
    />;
}
