import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_PROGRAMME } from '../../services/context/workflows';
import { FORMATION } from '../structure/def';

export { PROGRAMME_WORKFLOW } from './def';

export function ProgrammeLayout() {
    return <WorkflowLayout workflow={WORKFLOW_PROGRAMME} />;
}

export function ProgrammeIndex() {
    return <WorkflowIndex workflow={WORKFLOW_PROGRAMME} cheminParDefaut={FORMATION} />;
}
