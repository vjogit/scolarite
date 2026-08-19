import { WorkflowIndex, WorkflowLayoutSimple } from '../../services/context/WorkflowLayout';
import { WORKFLOW_USER } from '../../services/context/workflows';
import { USER } from './def';

export function UserLayout() {
    return <WorkflowLayoutSimple />;
}

export function UserIndex() {
    return <WorkflowIndex workflow={WORKFLOW_USER} cheminParDefaut={USER} />;
}
