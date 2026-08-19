/**
 * Navigation horizontale entre les tâches.
 *
 * Le fil d'Ariane reste la navigation verticale — descendre et remonter la
 * hiérarchie ; cette barre est la navigation horizontale — changer de tâche
 * sans changer de position. Les onglets ne sont jamais grisés : avec un
 * contexte partiel on atterrit simplement plus haut, et l'utilisateur poursuit
 * la sélection.
 *
 * Le rappel de contexte, à droite, est la navigation latérale : il change de
 * position sans changer de tâche.
 */

import { Fragment, useMemo, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';

import { useSession } from '../../SessionContext';
import type { ContexteHierarchique, Niveau } from './niveaux';
import { construireCheminWorkflow, ecranTerminalDuChemin, remplacerNiveau } from './navigation';
import { possedeUnRole, WORKFLOWS_HIERARCHIQUES, type DescripteurWorkflow } from './workflows';
import { useContexteHierarchie } from './contexte';
import { SelecteurNiveau } from './SelecteurNiveau';
import type { NiveauResolu } from './contexte';

interface NiveauAffiche {
    readonly niveau: Niveau;
    /** `undefined` pour le premier niveau non encore choisi. */
    readonly resolu: NiveauResolu | undefined;
}

/**
 * Les niveaux à proposer : ceux que porte l'URL, puis le premier qui manque.
 *
 * Proposer le niveau suivant permet de sauter un écran — choisir une promotion
 * depuis la liste des promotions mène directement à la liste des options. On
 * s'arrête là : un sélecteur plus profond n'aurait pas de parent connu, donc
 * rien à proposer.
 */
function niveauxAProposer(
    workflow: DescripteurWorkflow,
    parUrl: Partial<Record<Niveau, NiveauResolu>>,
): NiveauAffiche[] {
    const affiches: NiveauAffiche[] = [];

    for (const niveau of workflow.niveaux) {
        const resolu = parUrl[niveau];
        affiches.push({ niveau, resolu });
        if (resolu === undefined) break;
    }

    return affiches;
}

/** Rappel du contexte porté par l'URL, chaque niveau ouvrant ses frères. */
function SelecteursContexte({ workflowCourant }: { workflowCourant: DescripteurWorkflow }) {
    const navigate = useNavigate();
    const { parUrl, chemins } = useContexteHierarchie();

    const affiches = useMemo(
        () => niveauxAProposer(workflowCourant, parUrl),
        [workflowCourant, parUrl],
    );

    // Le contexte réellement affiché, d'où les sélecteurs tirent leur parent.
    const contexteAffiche = useMemo<ContexteHierarchique>(() => {
        const contexte: ContexteHierarchique = {};
        for (const { niveau, resolu } of affiches) {
            if (resolu !== undefined) contexte[niveau] = resolu.identifiant;
        }
        return contexte;
    }, [affiches]);

    if (affiches.length === 0) return null;

    const choisir = (niveau: Niveau, identifiant: string) => {
        // Les niveaux inférieurs sont abandonnés sans condition : ils décrivent
        // une autre branche. On pourrait les rétablir depuis la mémoire quand
        // ils restent valides, mais choisir une option ferait alors atterrir sur
        // un écran d'unités d'enseignement — une position dictée par une mémoire
        // que l'utilisateur ne voit pas. La descente reste explicite.
        const cible = remplacerNiveau(contexteAffiche, niveau, identifiant);

        // On ne change pas de tâche, seulement de position : même workflow,
        // même écran terminal qu'à la dernière visite.
        const prefere = ecranTerminalDuChemin(
            chemins[workflowCourant.id], workflowCourant.ecransTerminaux,
        );
        void navigate(construireCheminWorkflow(workflowCourant, cible, prefere));
    };

    return (
        <Stack
            direction="row"
            spacing={0.25}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ py: 0.5 }}
        >
            {affiches.map(({ niveau, resolu }, index) => (
                <Fragment key={niveau}>
                    {index > 0 && (
                        <Typography variant="body2" component="span" aria-hidden sx={{ color: 'text.secondary' }}>
                            ›
                        </Typography>
                    )}
                    <SelecteurNiveau
                        niveau={niveau}
                        valeur={resolu}
                        contexte={contexteAffiche}
                        onChoisir={choisir}
                    />
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
            <SelecteursContexte workflowCourant={workflowCourant} />
        </Box>
    );
}
