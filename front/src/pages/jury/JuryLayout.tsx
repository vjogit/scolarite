import type { BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_JURY } from '../../services/context/workflows';
import type { EntiteNommee } from '../../services/context/niveaux';
import { JURY } from './def';
import {
    FORMATION, PROMOTION, OPTION, PERIODE,
    ENDPOINT_FORMATION, ENDPOINT_OPTION, ENDPOINT_PERIODE, ENDPOINT_PROMOTION,
} from '../structure/def';

// ─── Contexte du Jury pour le Breadcrumb ──────────────────────────────────────
// Le breadcrumb du jury expose uniquement FORMATION → PROMOTION → OPTION → PERIODE.

const nom = (data: EntiteNommee) => data.name;

const JURY_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: ENDPOINT_FORMATION, nameResolver: nom },
    [PROMOTION]: { apiEntity: PROMOTION, path: ENDPOINT_PROMOTION, nameResolver: nom },
    [OPTION]: { apiEntity: OPTION, path: ENDPOINT_OPTION, nameResolver: nom },
    [PERIODE]: { apiEntity: PERIODE, path: ENDPOINT_PERIODE, nameResolver: nom },

    [JURY]: { apiEntity: JURY, path: '/a_faire', nameResolver: nom },
};

// ─── Layout & Index ───────────────────────────────────────────────────────────

export function JuryLayout() {
    return <WorkflowLayout workflow={WORKFLOW_JURY} label="Jury" entityMap={JURY_ENTITY_MAP} />;
}

export function JuryIndex() {
    return <WorkflowIndex workflow={WORKFLOW_JURY} cheminParDefaut={FORMATION} />;
}
