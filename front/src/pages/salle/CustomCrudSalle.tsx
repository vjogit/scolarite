/**
 * L'écran des salles tel que son workflow le monte.
 *
 * Dans son propre module : un composant défini à côté d'exports qui n'en
 * sont pas empêche le remplacement à chaud.
 */

import type { CrudComponentProps } from '../../services/crud/routes';
import { SALLE_WORKFLOW } from './def';
import { CrudSalle } from './Salle';

export function CustomCrudSalle({ mode }: CrudComponentProps) {
    return (
        <CrudSalle
            workflow={SALLE_WORKFLOW}
            mode={mode}
            isAction={true}
            isTopToolbar={true}
        />
    );
}
