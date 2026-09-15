/**
 * Constantes du domaine Syllabus.
 *
 * Le syllabus n'est pas un workflow : ses écrans se greffent sous le workflow
 * Structure — la fiche sous la matière et sous l'UE (lot 2), le référentiel de
 * compétences sous la formation (lot 3 : blocs, puis compétences d'un bloc).
 * `SYLLABUS`, `BLOC` et `COMPETENCE` sont les segments d'URL de ces greffes et
 * les espaces de noms des clés de requête.
 */
export const SYLLABUS = 'syllabus';
export const BLOC = 'bloc';
export const COMPETENCE = 'competence';

export const ENDPOINT_SYLLABUS = '/api/v0/syllabus';
export const ENDPOINT_SYLLABUS_MATIERE = `${ENDPOINT_SYLLABUS}/matiere`;
export const ENDPOINT_SYLLABUS_UE = `${ENDPOINT_SYLLABUS}/ue`;
// Le livret PDF d'une promotion (lot 5) : toutes les fiches de ses UE.
export const ENDPOINT_SYLLABUS_PROMOTION = `${ENDPOINT_SYLLABUS}/promotion`;
export const ENDPOINT_BLOC = `${ENDPOINT_SYLLABUS}/${BLOC}`;
export const ENDPOINT_COMPETENCE = `${ENDPOINT_SYLLABUS}/${COMPETENCE}`;
// Analyse d'impact avant suppression (POST, corps { ids: [...] }) : la
// suppression d'un bloc emporte ses compétences et leurs liaisons aux UE,
// celle d'une compétence ses liaisons — la modale les annonce.
export const ENDPOINT_BLOC_DELETE_IMPACT = `${ENDPOINT_BLOC}/delete-impact`;
export const ENDPOINT_COMPETENCE_DELETE_IMPACT = `${ENDPOINT_COMPETENCE}/delete-impact`;
