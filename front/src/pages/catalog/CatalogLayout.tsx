import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_CATALOG } from '../../services/context/workflows';
import { FORMATION } from '../structure/def';

export { CATALOG_WORKFLOW } from './def';

export function CatalogLayout() {
    return <WorkflowLayout workflow={WORKFLOW_CATALOG} />;
}

export function CatalogIndex() {
    return <WorkflowIndex workflow={WORKFLOW_CATALOG} cheminParDefaut={FORMATION} />;
}
