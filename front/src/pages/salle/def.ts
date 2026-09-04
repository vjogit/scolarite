import type { TFunction } from 'i18next';
import i18n from '../../i18n/config';

export const SALLE = 'salle';
export const SALLE_WORKFLOW = 'salle_workflow';

export const ENDPOINT_SALLE = '/api/v0/planning/salle';

export function typeSalleOptions(t?: TFunction<'salle'>): { id: string; label: string }[] {
    const traduire = t ?? i18n.getFixedT(null, 'salle');
    return [
        { id: 'AMPHI', label: traduire('types.AMPHI') },
        { id: 'TD', label: traduire('types.TD') },
        { id: 'TP', label: traduire('types.TP') },
        { id: 'LABO', label: traduire('types.LABO') },
        { id: 'INFORMATIQUE', label: traduire('types.INFORMATIQUE') },
    ];
}
