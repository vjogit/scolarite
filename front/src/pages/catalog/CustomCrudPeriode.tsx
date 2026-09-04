/**
 * L'écran des périodes tel que le workflow Structure le monte.
 *
 * Dans son propre module : un composant défini à côté d'exports qui n'en
 * sont pas empêche le remplacement à chaud.
 */

import type { ActionsBarreOutilsProps } from '../../services/crud/def';
import type { CrudComponentProps } from '../../services/crud/routes';
import { CATALOG_WORKFLOW } from './def';
import { CrudPeriode, type Periode } from '../structure/Periode';
import { PeriodeImportButton } from './PeriodeImportButton';
import { PeriodeExportButton } from './PeriodeExportButton';

export function CustomCrudPeriode({ mode }: CrudComponentProps) {

    const barreOutils = ({ defaultActions, peutEcrire }: ActionsBarreOutilsProps<Periode>) => (
        <div className="flex items-center gap-4">
            {defaultActions}
            {/* Import : une écriture de structure ; l'export reste une lecture,
                offerte à tous. */}
            {peutEcrire && <PeriodeImportButton />}
            <PeriodeExportButton />
        </div>
    )
    return <CrudPeriode workflow={CATALOG_WORKFLOW}
        mode={mode}
        isAction={true}
        isTopToolbar={true}
        actionsBarreOutils={barreOutils}
    />;
}
