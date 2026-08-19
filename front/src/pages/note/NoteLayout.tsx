import type { BreadcrumbEntityMap } from '../../services/CommonBreadcrumbs';
import { WorkflowIndex, WorkflowLayout } from '../../services/context/WorkflowLayout';
import { WORKFLOW_NOTE } from '../../services/context/workflows';
import type { EntiteNommee } from '../../services/context/niveaux';
import { CONTROLE, ENDPOINT_CONTROLE, ENDPOINT_NOTE_CONTROLE, NOTE } from './def';
import {
    FORMATION, PROMOTION, OPTION, PERIODE, UES, MATIERE,
    ENDPOINT_MATIERE, ENDPOINT_FORMATION, ENDPOINT_OPTION, ENDPOINT_PERIODE,
    ENDPOINT_PROMOTION, ENDPOINT_UES,
} from '../structure/def';

// ─── Contexte des notes ───────────────────────────────────────────────────────

interface Eleve {
    firstName: string;
    lastName: string;
}

const nom = (data: EntiteNommee) => data.name;

const NOTE_ENTITY_MAP: BreadcrumbEntityMap = {
    [FORMATION]: { apiEntity: FORMATION, path: ENDPOINT_FORMATION, nameResolver: nom },
    [PROMOTION]: { apiEntity: PROMOTION, path: ENDPOINT_PROMOTION, nameResolver: nom },
    [OPTION]: { apiEntity: OPTION, path: ENDPOINT_OPTION, nameResolver: nom },
    [PERIODE]: { apiEntity: PERIODE, path: ENDPOINT_PERIODE, nameResolver: nom },
    [UES]: { apiEntity: UES, path: ENDPOINT_UES, nameResolver: nom },
    [MATIERE]: { apiEntity: MATIERE, path: ENDPOINT_MATIERE, nameResolver: nom },
    [CONTROLE]: { apiEntity: CONTROLE, path: ENDPOINT_CONTROLE, nameResolver: nom },
    [NOTE]: {
        apiEntity: NOTE,
        path: ENDPOINT_NOTE_CONTROLE,
        nameResolver: (data: Eleve) => `${data.firstName} ${data.lastName}`,
    },
};

// ─── Layout & Index ───────────────────────────────────────────────────────────

export function NoteLayout() {
    return <WorkflowLayout workflow={WORKFLOW_NOTE} label="Controles" entityMap={NOTE_ENTITY_MAP} />;
}

export function NoteIndex() {
    return <WorkflowIndex workflow={WORKFLOW_NOTE} cheminParDefaut={FORMATION} />;
}
