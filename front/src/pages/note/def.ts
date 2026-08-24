export const NOTE_WORKFLOW ='note_workflow'

/**
 * Espace de noms des clés de requête du domaine résultat. Les clés de liste
 * sont à trois éléments `[espace, entité, parentId]`, comme celles de la
 * structure : une clé à deux éléments `['controle', id]` désignerait aussi
 * bien la liste des contrôles de la matière `id` que le détail du contrôle
 * `id`, et les deux formes se corrompraient mutuellement en cache.
 */
export const RESULTAT = 'resultat'

export const NOTE ="note"
export const CONTROLE="controle"

/**
 * Segment de l'axe Élève, chaînon frère de `ues` sous la période.
 *
 * Les quatre autres axes étaient déjà dans l'URL sans qu'on les y ait nommés :
 * l'axe d'un écran de notes est le segment qui porte le dernier identifiant
 * avant `note`. `eleve` complète la série dans la même grammaire, ce qui lui
 * vaut d'un coup le fil de contexte, le menu de ses frères — l'effectif de la
 * période, donc le sélecteur pré-filtré — et la survie au rechargement.
 */
export const ELEVE="eleve"

/** Ancienne entrée hors contexte, conservée pour la seule redirection. */
export const NOTE_ELEVE="note_eleve"


export const ENDPOINT_BASE = `/api/v0/resultat`

export const ENDPOINT_NOTE = `${ENDPOINT_BASE}/note`
export const ENDPOINT_NOTE_PERIODE = `${ENDPOINT_BASE}/note/periode`
export const ENDPOINT_NOTE_UE = `${ENDPOINT_BASE}/note/ue`
export const ENDPOINT_NOTE_MATIERE = `${ENDPOINT_BASE}/note/matiere`
export const ENDPOINT_NOTE_CONTROLE = `${ENDPOINT_BASE}/note/controle`

// Effectif d'un groupe pour un contrôle, notes comprises : la source de la
// grille de saisie. Distincte de ENDPOINT_NOTE_CONTROLE, qui part des notes
// existantes et ignore donc les élèves qui n'en ont pas encore.
export const ENDPOINT_NOTE_GRILLE = `${ENDPOINT_BASE}/note/grille`


export const ENDPOINT_CONTROLE = `${ENDPOINT_BASE}/${CONTROLE}`


  
