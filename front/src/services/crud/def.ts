import type { QueryKey } from '@tanstack/react-query';
import type { Control, DefaultValues, FieldErrors, FieldValues, UseFormGetValues, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import type { JSX, ReactNode } from 'react';
import type { MRT_ColumnDef, MRT_Row, MRT_TableInstance } from 'material-react-table';
import { apiInstance } from '../api';

export type CrudMode = 'create' | 'show' | 'edit' | 'list';

export interface CrudProps<D extends FieldValues> {
    mode: CrudMode
    workflow: string;
    isAction: boolean
    isReadOnly?: boolean
    renderRowActions?: (props: { row: MRT_Row<D>, table: MRT_TableInstance<D>, defaultActions: ReactNode, isEditMode: boolean }) => ReactNode
    isTopToolbar: boolean
    renderTopToolbarCustomActions?: (props: { table: MRT_TableInstance<D>, defaultActions: React.ReactNode, isEditMode: boolean }) => React.ReactNode
}

export interface RenderProps<D extends FieldValues> {
    register: UseFormRegister<D>
    control: Control<D>
    errors: FieldErrors<D>
    isReadOnly: boolean
    getValues: UseFormGetValues<D>
    setValue: UseFormSetValue<D>
}

/** Objet directement visé par une suppression. */
export interface DeleteImpactItem {
    id: number;
    name: string;
}

/** Décompte de descendants pour une entité, libellé déjà accordé en nombre. */
export interface DeleteImpactEntry {
    entity: string;
    label: string;
    count: number;
}

/** Raison métier interdisant la suppression. */
export interface DeleteImpactBlocking {
    reason: string;
    message: string;
}

/** Réponse de l'endpoint d'analyse d'impact (POST .../delete-impact). */
export interface DeleteImpact {
    items: DeleteImpactItem[];
    /** Entités réellement supprimées en cascade, ordre hiérarchique, compte > 0. */
    cascade: DeleteImpactEntry[];
    /** Objets conservés mais dont la référence est mise à NULL. */
    detached: DeleteImpactEntry[];
    /** Non vide : la suppression doit être refusée. */
    blocking: DeleteImpactBlocking[];
}

export interface Repository<D extends FieldValues> {
    queryKey: QueryKey;
    getId: (data: D) => number;
    /** Libellé lisible de l'objet, utilisé par la modale de suppression. */
    getName: (data: D) => string;
    update: (data: D) => Promise<D>;
    create: (data: D) => Promise<D>;
    fetch: (ids: string | undefined) => Promise<D>;
    fetchAll: () => Promise<D[]>;
    delete: (id: number[]) => Promise<{ success: boolean }>;
    /** Absent si l'entité n'expose pas d'endpoint d'analyse d'impact. */
    deleteImpact?: (ids: number[]) => Promise<DeleteImpact>;
}

export interface ViewConfig<D extends FieldValues> {
    schema: any
    emptyValue: DefaultValues<D>;
    columns: MRT_ColumnDef<D>[];
    render: (props: RenderProps<D>) => JSX.Element;
}

export interface Datasource<D extends FieldValues> extends Repository<D>, ViewConfig<D> {
    title: string
    /** Entité de haut niveau : la modale exige de retaper le nom avant suppression. */
    deleteRequiresNameConfirmation?: boolean
    /** Libellé singulier avec article, ex. "la formation", affiché dans la modale. */
    deleteEntityLabel?: string
    /** Libellé pluriel sans article, ex. "périodes". À défaut, `title` en minuscules. */
    deleteEntityLabelPlural?: string
    first?: boolean
    isAction: boolean
    isReadOnly?: boolean
    renderRowActions?: (props: { row: MRT_Row<D>, table: MRT_TableInstance<D>, defaultActions: ReactNode, isEditMode: boolean }) => ReactNode
    isTopToolbar: boolean
    renderTopToolbarCustomActions?: (props: { table: MRT_TableInstance<D>, defaultActions: React.ReactNode, isEditMode: boolean }) => React.ReactNode
}

interface RepositoryConfig<D extends FieldValues> {
    endpoint: string;
    queryParams?: string;
    queryKey: QueryKey;
    getId: (data: D) => number;
    /** Par défaut : le champ `name` de l'objet, sinon `#<id>`. */
    getName?: (data: D) => string;
    /** Endpoint d'analyse d'impact. Omis, la modale reste sans décompte. */
    deleteImpactEndpoint?: string;
}

export function createRepository<T extends FieldValues>(
    config: RepositoryConfig<T>
): Repository<T> {
    const endpoint = config.endpoint

    // Par défaut on affiche le champ `name`, présent sur toutes les entités
    // de structure ; à défaut, l'identifiant technique.
    const getName = config.getName ?? ((data: T) => {
        const name: unknown = data['name'];
        return typeof name === 'string' && name.length > 0 ? name : `#${config.getId(data)}`;
    });

    const deleteImpactEndpoint = config.deleteImpactEndpoint;

    return {
        queryKey: config.queryKey,
        getId: config.getId,
        getName,

        // Analyse d'impact avant suppression : uniquement si l'entité
        // expose l'endpoint correspondant côté serveur.
        ...(deleteImpactEndpoint ? {
            deleteImpact: async (ids: number[]): Promise<DeleteImpact> => {
                try {
                    const rep = await apiInstance.post<DeleteImpact>(deleteImpactEndpoint, { ids });
                    return rep.data;
                } catch (error) {
                    throw handleAxiosError(error);
                }
            },
        } : {}),

        // Récupérer tous les éléments
        fetchAll: async () => {
            try {
                const url = config.queryParams ? `${endpoint}${config.queryParams}` : endpoint;
                const rep = await apiInstance.get<T[]>(url);
                return rep.data
            } catch (error: any) {
                throw handleAxiosError(error);
            }
        },

        // Récupérer un élément par ID
        fetch: async (id) => {
            try {
                const rep = await apiInstance.get<T>(`${endpoint}/${id}`);
                return rep.data
            } catch (error: any) {
                throw handleAxiosError(error);
            }

        },

        // Créer
        create: async (data) => {
            try {
                const rep = await apiInstance.post<T>(endpoint, data);
                return rep.data
            } catch (error: any) {
                throw handleAxiosError(error);
            }
        },

        // Mettre à jour
        update: async (data) => {
            try {
                const id = config.getId(data);
                const rep = await apiInstance.put<T>(`${endpoint}/${id}`, data);
                return rep.data
            } catch (error: any) {
                throw handleAxiosError(error);
            }
        },

        // Supprimer (Bulk)
        delete: async (ids: (string | number)[]) => {
            try {
                const rep = await apiInstance.delete(`${endpoint}/bulk`, { data: { ids } });
                return rep.data
            } catch (error: any) {
                throw handleAxiosError(error);
            }
        },
    };
}

/**
 * Helper pour transformer les erreurs Axios en votre format ApiError
 * compatible avec votre backend Go
 */
export function handleAxiosError(error: any) {
    if (error.response) {
        // L'erreur vient du serveur (400, 401, 409...)
        return new ApiError(error.response.status, error.response.data);
    }
    return new Error("Erreur réseau ou serveur injoignable");
}


export class ApiError extends Error {
    payload: ErrorResponse | undefined;
    status: number;
    constructor(status: number, payload?: ErrorResponse) {
        super('API Error');
        this.status = status;
        this.payload = payload;
    }

    static async fromResponse(response: Response): Promise<ApiError> {
        const errorBody = await response.json() as ErrorResponse;
        return new ApiError(response.status, errorBody);
    }
}

export interface ErrorResponse {
    code: string
    message: string
    details?: unknown
}
