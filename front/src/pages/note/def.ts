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


  
