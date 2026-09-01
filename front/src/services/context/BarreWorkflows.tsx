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

import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
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

    const courantVisible = onglets.some(workflow => workflow.id === workflowCourant.id);

    const basculer = (id: unknown) => {
        const cible = onglets.find(workflow => workflow.id === id);
        if (cible === undefined || cible.id === workflowCourant.id) return;

        const prefere = ecranTerminalDuChemin(chemins[cible.id], cible.ecransTerminaux);
        void navigate(construireCheminWorkflow(cible, pourNavigation, prefere));
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4">
            {/* Une barre à un seul onglet ne fait basculer nulle part. */}
            {onglets.length >= 2 && (
                // Onglets de navigation, sans panneaux : la sélection suit
                // l'URL (`value` contrôlé), le choix navigue. `null` quand le
                // workflow courant n'est pas dans la barre — l'équivalent du
                // `value={false}` MUI. L'activation reste au choix explicite
                // (Entrée/clic), pas au passage des flèches
                // (`activateOnFocus` est `false` par défaut).
                <Tabs
                    value={courantVisible ? workflowCourant.id : null}
                    onValueChange={basculer}
                    // Le débordement défile ici, pas sur la page — l'héritier
                    // du `variant="scrollable"` MUI.
                    className="min-w-0 max-w-full overflow-x-auto"
                >
                    <TabsList variant="line" aria-label={t('barreWorkflows.navigationAriaLabel')}>
                        {onglets.map(workflow => (
                            <TabsTrigger key={workflow.id} value={workflow.id} className="flex-none">
                                {libelleWorkflow(workflow, t)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            )}
            {workflowCourant.presentationContexte !== 'arbre'
                && <FilContexte workflowCourant={workflowCourant} />}
        </div>
    );
}
