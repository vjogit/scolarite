/**
 * Le layout commun aux workflows.
 *
 * Les sept layouts d'origine étaient le même code à la constante près :
 * mémoriser le chemin courant, afficher un fil d'Ariane, rediriger l'index
 * vers le dernier écran visité. La mémorisation est désormais tenue par le
 * `ContexteHierarchieProvider` pour tous les workflows à la fois, et le fil de
 * contexte se déduit du descripteur ; il ne reste ici que la composition de
 * l'écran.
 */

import { Navigate, Outlet } from 'react-router';
import { Box } from '@mui/material';

import { BarreWorkflows } from './BarreWorkflows';
import { useContexteHierarchie } from './contexte';
import { construireCheminWorkflow, ecranTerminalDuChemin, estCheminCompatible } from './navigation';
import type { DescripteurWorkflow } from './workflows';

/** Workflow hiérarchique : une seule barre, onglets de tâches et fil de contexte. */
export function WorkflowLayout({ workflow }: { workflow: DescripteurWorkflow }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <BarreWorkflows workflowCourant={workflow} />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <Outlet />
            </Box>
        </Box>
    );
}

/** Workflow sans contexte hiérarchique : ni fil d'Ariane, ni barre d'onglets. */
export function WorkflowLayoutSimple() {
    return (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Outlet />
        </Box>
    );
}

/**
 * Entrée dans un workflow depuis le menu de gauche.
 *
 * On revient là où l'on était, tant que ce chemin ne contredit pas le contexte
 * courant : après un changement de promotion ailleurs, le reconstruire depuis
 * le contexte vaut mieux que ramener sur une période devenue étrangère.
 */
export function WorkflowIndex({ workflow, cheminParDefaut }: {
    workflow: DescripteurWorkflow;
    cheminParDefaut: string;
}) {
    const { pourNavigation, chemins } = useContexteHierarchie();

    const memorise = chemins[workflow.id];
    if (memorise !== undefined && estCheminCompatible(memorise, pourNavigation)) {
        return <Navigate to={memorise} replace />;
    }

    if (workflow.niveaux.length === 0) {
        return <Navigate to={`/${workflow.chemin}/${cheminParDefaut}`} replace />;
    }

    const prefere = ecranTerminalDuChemin(memorise, workflow.ecransTerminaux);
    return <Navigate to={construireCheminWorkflow(workflow, pourNavigation, prefere)} replace />;
}
