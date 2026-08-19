import type { BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_CATALOG } from '../../services/context/workflows';
import type { EntiteNommee } from '../../services/context/niveaux';
import {
    FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE, GROUPE,
    ENDPOINT_FORMATION, ENDPOINT_MATIERE, ENDPOINT_OPTION, ENDPOINT_PERIODE,
    ENDPOINT_PROMOTION, ENDPOINT_UES, ENDPOINT_GROUPE,
} from '../structure/def';

export { CATALOG_WORKFLOW } from './def';

// ─── Contexte du catalogue ────────────────────────────────────────────────────

const nom = (data: EntiteNommee) => data.name;

const CATALOG_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: ENDPOINT_FORMATION, nameResolver: nom },
    [PROMOTION]: { apiEntity: PROMOTION, path: ENDPOINT_PROMOTION, nameResolver: nom },
    [OPTION]: { apiEntity: OPTION, path: ENDPOINT_OPTION, nameResolver: nom },
    [PERIODE]: { apiEntity: PERIODE, path: ENDPOINT_PERIODE, nameResolver: nom },
    [UES]: { apiEntity: UES, path: ENDPOINT_UES, nameResolver: nom },
    [MATIERE]: { apiEntity: MATIERE, path: ENDPOINT_MATIERE, nameResolver: nom },
    [GROUPE]: { apiEntity: GROUPE, path: ENDPOINT_GROUPE, nameResolver: nom, filteredSegments: ['user'] },
};

// ─── Layout & Index ───────────────────────────────────────────────────────────

export function CatalogLayout() {
    return <WorkflowLayout workflow={WORKFLOW_CATALOG} label="Formations" entityMap={CATALOG_ENTITY_MAP} />;
}

export function CatalogIndex() {
    return <WorkflowIndex workflow={WORKFLOW_CATALOG} cheminParDefaut={FORMATION} />;
}
