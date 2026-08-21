import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_NOTE } from '../../services/context/workflows';
import { FORMATION } from '../structure/def';

export function NoteLayout() {
    return <WorkflowLayout workflow={WORKFLOW_NOTE} />;
}

export function NoteIndex() {
    return <WorkflowIndex workflow={WORKFLOW_NOTE} cheminParDefaut={FORMATION} />;
}
