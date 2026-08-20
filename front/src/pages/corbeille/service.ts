import { apiInstance } from '../../services/api';
import { handleAxiosError } from '../../services/crud/def';
import type { DeleteImpactBlocking, DeleteImpactEntry, DeleteImpactItem } from '../../services/crud/def';
import { ENDPOINT_CORBEILLE } from './def';

/**
 * Une opération de corbeille telle que le serveur la liste : ses racines
 * nommées et le chiffrage de ce que sa purge détruirait, dans les mêmes
 * structures que delete-impact.
 */
export interface OperationCorbeille {
    id: number;
    /** 'formation' | 'promotion' | 'option' | 'periode' */
    racineType: string;
    deletedAt: string;
    /** Le sub Keycloak brut, repli d'affichage. */
    deletedBy: string;
    /** « Prénom Nom » si l'auteur a un compte applicatif. */
    deletedByNom: string | null;
    items: DeleteImpactItem[];
    cascade: DeleteImpactEntry[];
    detached: DeleteImpactEntry[];
    /** Non vide : la purge est refusée (période délibérée). */
    blocking: DeleteImpactBlocking[];
}

export async function fetchCorbeille(): Promise<OperationCorbeille[]> {
    try {
        const rep = await apiInstance.get<OperationCorbeille[]>(ENDPOINT_CORBEILLE);
        return rep.data;
    } catch (error) {
        throw handleAxiosError(error);
    }
}

export async function restaurerOperation(id: number): Promise<void> {
    try {
        await apiInstance.post(`${ENDPOINT_CORBEILLE}/${String(id)}/restaurer`);
    } catch (error) {
        throw handleAxiosError(error);
    }
}

export async function purgerOperation(id: number): Promise<void> {
    try {
        await apiInstance.delete(`${ENDPOINT_CORBEILLE}/${String(id)}`);
    } catch (error) {
        throw handleAxiosError(error);
    }
}
