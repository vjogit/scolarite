/**
 * L'entrée « Scolarité » du menu latéral, et l'atterrissage à la racine.
 *
 * Le latéral ne porte plus que des destinations globales ; les cinq tâches
 * ancrées sur la hiérarchie sont dans la barre de la page. Il fallait donc un
 * chemin de retour depuis les salles, les utilisateurs ou la corbeille — sans
 * quoi ces trois écrans seraient des impasses.
 *
 * Ce composant ne restaure rien lui-même : il décide seulement *quel* workflow
 * reprendre, et laisse `WorkflowIndex` faire ce qu'il fait déjà pour l'entrée
 * normale d'un workflow — rejouer le chemin mémorisé s'il ne contredit pas le
 * contexte, le reconstruire sinon. « Reprendre où j'en étais » reste défini à
 * un seul endroit.
 *
 * La racine emprunte le même composant : jusqu'ici `/` n'avait pas de route
 * d'index et n'affichait rien. C'est pourtant là qu'atterrissent la connexion,
 * la déconnexion et le titre de l'application.
 */

import { Navigate } from 'react-router';

import { useContexteHierarchie } from './contexte';
import { WORKFLOW_CATALOG, WORKFLOWS_HIERARCHIQUES } from './workflows';

/** Segment de l'entrée de menu ; ne couvre aucun écran, seulement ce renvoi. */
export const SEGMENT_SCOLARITE = 'scolarite';

export function RetourScolarite() {
    const { dernierWorkflow } = useContexteHierarchie();

    // La recherche vaut validation : un identifiant venu d'une session plus
    // ancienne, qui ne désigne plus aucun workflow, retombe sur la Structure —
    // qui est aussi le repli en session neuve.
    const workflow = WORKFLOWS_HIERARCHIQUES.find(candidat => candidat.id === dernierWorkflow)
        ?? WORKFLOW_CATALOG;

    return <Navigate to={`/${workflow.chemin}`} replace />;
}
