/**
 * Navigation horizontale entre les tâches.
 *
 * Les onglets sont la navigation horizontale — changer de tâche sans changer
 * de position ; ils ne sont jamais grisés : avec un contexte partiel on
 * atterrit simplement plus haut, et l'utilisateur poursuit la sélection.
 *
 * Le fil de contexte, à droite, porte tout le reste : descendre, remonter,
 * changer de frère — c'est l'unique navigation contextuelle depuis la fusion
 * du fil d'Ariane et du rappel de contexte.
 *
 * Sauf là où un arbre le remplace. Le workflow Structure montre la hiérarchie
 * entière et ses frères par ses nœuds dépliés : garder le fil au-dessus y
 * serait la redondance que cette fusion avait précisément supprimée. Les
 * onglets, eux, restent — changer de tâche n'a pas d'autre chemin.
 */

import type { SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { Box, Tab, Tabs } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { useSession } from '../../SessionContext';
import { construireCheminWorkflow, ecranTerminalDuChemin } from './navigation';
import { libelleWorkflow, possedeUnRole, WORKFLOWS_HIERARCHIQUES, type DescripteurWorkflow } from './workflows';
import { useContexteHierarchie } from './contexte';
import { FilContexte } from './FilContexte';

export function BarreWorkflows({ workflowCourant }: { workflowCourant: DescripteurWorkflow }) {
    const navigate = useNavigate();
    const { session } = useSession();
    const { pourNavigation, chemins } = useContexteHierarchie();
    const { t } = useTranslation('app');

    const onglets = WORKFLOWS_HIERARCHIQUES.filter(
        workflow => possedeUnRole(session?.user.roles, workflow.rolesRequis),
    );

    const indexCourant = onglets.findIndex(workflow => workflow.id === workflowCourant.id);

    const basculer = (_evenement: SyntheticEvent, index: number) => {
        const cible = onglets.at(index);
        if (cible === undefined || cible.id === workflowCourant.id) return;

        const prefere = ecranTerminalDuChemin(chemins[cible.id], cible.ecransTerminaux);
        void navigate(construireCheminWorkflow(cible, pourNavigation, prefere));
    };

    return (
        <Box
            sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 2, px: 2, flexWrap: 'wrap',
                borderBottom: 1, borderColor: 'divider',
            }}
        >
            {/* Une barre à un seul onglet ne fait basculer nulle part. */}
            {onglets.length >= 2 && (
                <Tabs
                    value={indexCourant === -1 ? false : indexCourant}
                    onChange={basculer}
                    variant="scrollable"
                    scrollButtons="auto"
                    aria-label={t('barreWorkflows.navigationAriaLabel')}
                    sx={{ minHeight: 40 }}
                >
                    {onglets.map(workflow => (
                        <Tab
                            key={workflow.id}
                            label={libelleWorkflow(workflow, t)}
                            sx={{ minHeight: 40, textTransform: 'none' }}
                        />
                    ))}
                </Tabs>
            )}
            {workflowCourant.presentationContexte !== 'arbre'
                && <FilContexte workflowCourant={workflowCourant} />}
        </Box>
    );
}
