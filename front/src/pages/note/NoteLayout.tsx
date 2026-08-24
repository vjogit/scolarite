import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_NOTE } from '../../services/context/workflows';
import { FORMATION } from '../structure/def';
import { BarreAxes } from './BarreAxes';

export function NoteLayout() {
    // Le commutateur d'axe est monté une fois pour les cinq axes, entre la
    // barre partagée et l'écran. Il s'efface de lui-même au-dessus de la
    // période, où il n'y a pas encore d'axe à commuter.
    return <WorkflowLayout workflow={WORKFLOW_NOTE} enTete={<BarreAxes />} />;
}

export function NoteIndex() {
    return <WorkflowIndex workflow={WORKFLOW_NOTE} cheminParDefaut={FORMATION} />;
}
