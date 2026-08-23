import { WorkflowIndex } from '../../services/context/WorkflowLayout';
import { WORKFLOW_CATALOG } from '../../services/context/workflows';
import { FORMATION } from '../structure/def';
import { StructureLayout } from './StructureLayout';

export { CATALOG_WORKFLOW } from './def';

/**
 * Seul workflow à présenter la hiérarchie en maître-détail : sa tâche propre
 * est de la construire, pas de parcourir un contenu terminal. Les quatre
 * autres gardent `WorkflowLayout`.
 */
export function CatalogLayout() {
    return <StructureLayout />;
}

export function CatalogIndex() {
    return <WorkflowIndex workflow={WORKFLOW_CATALOG} cheminParDefaut={FORMATION} />;
}
