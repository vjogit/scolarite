
export const JURY = "jury"
export const JURY_WORKFLOW = 'jury_workflow';

export const ENDPOINT_BASE = `/api/v0/resultat`
export const ENDPOINT_JURY = `${ENDPOINT_BASE}/${JURY}`
export const ENDPOINT_DELIBERER = (periodeId: string) => `${ENDPOINT_JURY}/periode/${periodeId}/deliberer`


// Ue représente une unité d'enseignement
export interface Ue {
  id: number;
  nom: string;
  ects: number;
}

// Hierarchie représente la hiérarchie des UEs pour une période
export interface Hierarchie {
  periode: string;
  ues: Ue[];
}

// UeStat (utilise les noms des tags json de la structure Go)
export interface UeStat {
  moyenne_ue: number | null;
  grade_lettre: string | null;
  nom: string | null;
  ects: number | null;
  prenom: string | null;
}


// JuryStat (utilise les noms des tags json de la structure Go)
export interface JuryStat {
  firstName: string | null;
  lastName: string | null;
  gpa_periode: number | null;
  gpa_academique_periode: number | null
  gpa_cumule: string | null
  total_ects_valides: number;
  total_ects_periode: number;
  total_ects_valides_cumule: string | null
  total_ects_cumule: string | null
  toeic: string | null
  mobilite_valide: boolean | null
  decision_jury: string | null
}

// StudentEntry associe un userID à ses statistiques de jury
export interface StudentEntry {
  userID: number;
  juryStat: JuryStat;
}

// JuryResult représente une délibération enregistrée dans jury_result
export interface JuryResult {
  jr_user_id: number;
  jr_periode_id: number;
  jr_unite_enseignement_id: number;
  jr_grade: string;
  jr_gpa_index: number;
  jr_compte_cumul: boolean;
  delibere_at: string;
}

/**
 * Grade rendu par la fonction de jury pour une UE dont une matière au moins
 * n'a pas de moyenne. Même littéral que `GRADE_NON_EVALUE` côté serveur.
 */
export const GRADE_NON_EVALUE = 'N.E.';

/**
 * Les UE non évaluées d'un élève, nommées.
 *
 * Un dossier qui en porte une n'est pas délibérable : l'élève repassera en jury
 * quand ses notes seront complètes. Le serveur refuse déjà la délibération ;
 * cette fonction sert à le dire avant l'envoi plutôt qu'après le 409, et à
 * nommer les UE en cause.
 */
export function uesNonEvaluees(
    statsUe: JuryData['statsUe'],
    ues: readonly Ue[],
    userID: number,
): string[] {
    const parUe = statsUe[userID];
    if (!parUe) return [];
    return ues
        .filter(ue => parUe[ue.id]?.grade_lettre === GRADE_NON_EVALUE)
        .map(ue => ue.nom);
}

// JuryData contient toutes les données nécessaires
export interface JuryData {
  // En Go, le pointeur *Hierarchie indique qu'il peut être nul
  hierarchy: Hierarchie | null;
  students: StudentEntry[];
  // map[int32]map[int32]UeStat se traduit par des Records imbriqués
  statsUe: Record<number, Record<number, UeStat>>;
}
