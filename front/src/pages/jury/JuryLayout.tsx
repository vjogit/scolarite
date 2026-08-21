import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_JURY } from '../../services/context/workflows';
import { FORMATION } from '../structure/def';

export function JuryLayout() {
    return <WorkflowLayout workflow={WORKFLOW_JURY} />;
}

export function JuryIndex() {
    return <WorkflowIndex workflow={WORKFLOW_JURY} cheminParDefaut={FORMATION} />;
}
