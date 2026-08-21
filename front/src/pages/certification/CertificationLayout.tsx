import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_CERTIFICATION } from '../../services/context/workflows';
import { FORMATION } from '../structure/def';

export function CertificationLayout() {
    return <WorkflowLayout workflow={WORKFLOW_CERTIFICATION} />;
}

export function CertificationIndex() {
    return <WorkflowIndex workflow={WORKFLOW_CERTIFICATION} cheminParDefaut={FORMATION} />;
}
