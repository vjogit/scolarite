import { BREADCRUMB_PATH_NOT_USED, type BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_CERTIFICATION } from '../../services/context/workflows';
import type { EntiteNommee } from '../../services/context/niveaux';
import { TOEIC, MOBILITE } from './def';
import { ENDPOINT_FORMATION, ENDPOINT_PROMOTION, FORMATION, PROMOTION } from '../structure/def';

// ─── Contexte des certifications ──────────────────────────────────────────────

const nom = (data: EntiteNommee) => data.name;

const CERTIFICATION_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: ENDPOINT_FORMATION, nameResolver: nom },
    [PROMOTION]: { apiEntity: PROMOTION, path: ENDPOINT_PROMOTION, nameResolver: nom },

    [TOEIC]: { apiEntity: TOEIC, path: BREADCRUMB_PATH_NOT_USED, nameResolver: () => 'toeic' },
    [MOBILITE]: { apiEntity: MOBILITE, path: BREADCRUMB_PATH_NOT_USED, nameResolver: () => 'mobilite' },
};

// ─── Layout & Index ───────────────────────────────────────────────────────────

export function CertificationLayout() {
    return <WorkflowLayout workflow={WORKFLOW_CERTIFICATION} label="Certification" entityMap={CERTIFICATION_ENTITY_MAP} />;
}

export function CertificationIndex() {
    return <WorkflowIndex workflow={WORKFLOW_CERTIFICATION} cheminParDefaut={FORMATION} />;
}
