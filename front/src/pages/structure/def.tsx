
export const STRUCTURE = "structure"
export const FORMATION = "formation"
export const MATIERE = "matiere"
export const OPTION = "option"
export const PERIODE = "periode"
export const UES = "ue"
export const PROMOTION = "promotion"
export const GROUPE = "groupe"


export const ENDPOINT_STRUCTURE = `/api/v0/structure`

export const ENDPOINT_FORMATION = `${ENDPOINT_STRUCTURE}/${FORMATION}`
export const ENDPOINT_PROMOTION = `${ENDPOINT_STRUCTURE}/${PROMOTION}`
export const ENDPOINT_OPTION = `${ENDPOINT_STRUCTURE}/${OPTION}`
export const ENDPOINT_PERIODE = `${ENDPOINT_STRUCTURE}/${PERIODE}`
export const ENDPOINT_UES = `${ENDPOINT_STRUCTURE}/${UES}`
export const ENDPOINT_MATIERE = `${ENDPOINT_STRUCTURE}/${MATIERE}`
export const ENDPOINT_GROUPE = `${ENDPOINT_STRUCTURE}/${GROUPE}`




// Analyse d'impact avant suppression (POST, corps { ids: [...] }).
// Seules les entités structurantes l'exposent : les entités feuilles n'en ont
// pas besoin et la modale dégrade proprement en son absence.
export const ENDPOINT_FORMATION_DELETE_IMPACT = `${ENDPOINT_FORMATION}/delete-impact`
export const ENDPOINT_PROMOTION_DELETE_IMPACT = `${ENDPOINT_PROMOTION}/delete-impact`
export const ENDPOINT_OPTION_DELETE_IMPACT = `${ENDPOINT_OPTION}/delete-impact`
export const ENDPOINT_PERIODE_DELETE_IMPACT = `${ENDPOINT_PERIODE}/delete-impact`
