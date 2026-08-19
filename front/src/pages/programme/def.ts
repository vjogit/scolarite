export const PROGRAMME = "programme"

// evite une dependance circulaire


export interface SalleRef { id: number; name: string; batiment?: string }
export interface IntervenantRef { id: number; firstName?: string; lastName?: string }
export interface GroupeRef { id: number; name: string; option_id: number }


export interface Horaire {
    Lower: string;
    Upper: string;
}

export interface ReservationDetail {
    id: number;
    version: number;
    horaire: Horaire;
    periode_id: number;
    matiere_id?: number | null;
    matiere_name?: string | null;
    matiere_color?: string | null;
    type_cours?: string | null;
    is_distanciel: boolean;
    description?: string | null;
    salles: SalleRef[];
    intervenants: IntervenantRef[];
    groupes: GroupeRef[];
}

/**
 * Nom du workflow Programme. Défini ici et non dans `ProgrammeLayout` : les
 * descripteurs de `services/context` en ont besoin, et le layout les importe.
 */
export const PROGRAMME_WORKFLOW = 'programme_context';
