import { WorkflowIndex, WorkflowLayoutSimple } from '../../services/context/WorkflowLayout';
import { WORKFLOW_SALLE } from '../../services/context/workflows';
import { SALLE } from './def';

export function SalleLayout() {
    return <WorkflowLayoutSimple />;
}

export function SalleIndex() {
    return <WorkflowIndex workflow={WORKFLOW_SALLE} cheminParDefaut={SALLE} />;
}
