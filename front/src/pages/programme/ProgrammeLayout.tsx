import type { BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_PROGRAMME } from '../../services/context/workflows';
import type { EntiteNommee } from '../../services/context/niveaux';
import { PROGRAMME } from './def';
import {
    FORMATION, PROMOTION, OPTION, PERIODE,
    ENDPOINT_FORMATION, ENDPOINT_OPTION, ENDPOINT_PERIODE, ENDPOINT_PROMOTION,
} from '../structure/def';

export { PROGRAMME_WORKFLOW } from './def';

// ─── Contexte du programme ────────────────────────────────────────────────────

const nom = (data: EntiteNommee) => data.name;

const PROGRAMME_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: ENDPOINT_FORMATION, nameResolver: nom },
    [PROMOTION]: { apiEntity: PROMOTION, path: ENDPOINT_PROMOTION, nameResolver: nom },
    [OPTION]: { apiEntity: OPTION, path: ENDPOINT_OPTION, nameResolver: nom },
    [PERIODE]: { apiEntity: PERIODE, path: ENDPOINT_PERIODE, nameResolver: nom, filteredSegments: [PROGRAMME] },
};

// ─── Layout & Index ───────────────────────────────────────────────────────────

export function ProgrammeLayout() {
    return <WorkflowLayout workflow={WORKFLOW_PROGRAMME} label="Programme" entityMap={PROGRAMME_ENTITY_MAP} />;
}

export function ProgrammeIndex() {
    return <WorkflowIndex workflow={WORKFLOW_PROGRAMME} cheminParDefaut={FORMATION} />;
}
