/**
 * Constantes du domaine Syllabus.
 *
 * Le syllabus n'est pas un workflow : ses deux écrans se greffent sous la
 * matière et sous l'UE du workflow Structure (lot 2). `SYLLABUS` est le segment
 * d'URL de ces greffes et l'espace de noms des clés de requête de la fiche.
 */
export const SYLLABUS = 'syllabus';

export const ENDPOINT_SYLLABUS = '/api/v0/syllabus';
export const ENDPOINT_SYLLABUS_MATIERE = `${ENDPOINT_SYLLABUS}/matiere`;
export const ENDPOINT_SYLLABUS_UE = `${ENDPOINT_SYLLABUS}/ue`;
