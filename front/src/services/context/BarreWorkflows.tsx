/**
 * Navigation horizontale entre les tâches.
 *
 * Le fil d'Ariane reste la navigation verticale — descendre et remonter la
 * hiérarchie ; cette barre est la navigation horizontale — changer de tâche
 * sans changer de position. Les onglets ne sont jamais grisés : avec un
 * contexte partiel on atterrit simplement plus haut, et l'utilisateur poursuit
 * la sélection.
 */

import { Fragment, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { Box, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';

import { useSession } from '../../SessionContext';
import { LIBELLE_NIVEAU, NIVEAUX } from './niveaux';
import { construireCheminWorkflow, ecranTerminalDuChemin } from './navigation';
import { possedeUnRole, WORKFLOWS_HIERARCHIQUES, type DescripteurWorkflow } from './workflows';
import { useContexteHierarchie } from './contexte';

const NOM_INDISPONIBLE = '—';

/** Rappel discret du contexte porté par l'URL, à droite des onglets. */
function RappelContexte() {
    const { parUrl } = useContexteHierarchie();

    const affiches = NIVEAUX.flatMap(niveau => {
        const resolu = parUrl[niveau];
        return resolu === undefined ? [] : [{ niveau, resolu }];
    });

    if (affiches.length === 0) return null;

    return (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'text.secondary', py: 0.5 }}>
            {affiches.map(({ niveau, resolu }, index) => (
                <Fragment key={niveau}>
                    {index > 0 && <Typography variant="body2" component="span" aria-hidden>›</Typography>}
                    {resolu.enChargement
                        ? <Skeleton variant="text" width={72} aria-label={`Chargement ${LIBELLE_NIVEAU[niveau]}`} />
                        : (
                            <Typography variant="body2" component="span" title={LIBELLE_NIVEAU[niveau]}>
                                {resolu.nom ?? NOM_INDISPONIBLE}
                            </Typography>
                        )}
                </Fragment>
            ))}
        </Stack>
    );
}

export function BarreWorkflows({ workflowCourant }: { workflowCourant: DescripteurWorkflow }) {
    const navigate = useNavigate();
    const { session } = useSession();
    const { pourNavigation, chemins } = useContexteHierarchie();

    const onglets = WORKFLOWS_HIERARCHIQUES.filter(
        workflow => possedeUnRole(session?.user.roles, workflow.rolesRequis),
    );

    // Une barre à un seul onglet ne fait basculer nulle part.
    if (onglets.length < 2) return null;

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
            <Tabs
                value={indexCourant === -1 ? false : indexCourant}
                onChange={basculer}
                variant="scrollable"
                scrollButtons="auto"
                aria-label="Navigation entre les tâches"
                sx={{ minHeight: 40 }}
            >
                {onglets.map(workflow => (
                    <Tab
                        key={workflow.id}
                        label={workflow.libelle}
                        sx={{ minHeight: 40, textTransform: 'none' }}
                    />
                ))}
            </Tabs>
            <RappelContexte />
        </Box>
    );
}
