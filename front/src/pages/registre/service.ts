import { apiInstance } from '../../services/api';
import { handleAxiosError } from '../../services/crud/def';
import { ENDPOINT_REGISTRE } from './def';

/** Résultat de la vérification d'intégrité de la chaîne (VerifierChaine). */
export interface VerificationChaine {
    ok: boolean;
    maillons: number;
    /** Seq du premier maillon rompu ; absent quand ok. */
    broken_at?: number;
    error?: string;
}

/** Une ancre RFC 3161 telle que listée : des repères, jamais le jeton. */
export interface Ancre {
    id: number;
    registre_seq: number;
    created_at: string;
    tsa_url: string;
}

/** Résultat d'un passage d'ancrage manuel, une entrée par TSA. */
export interface ResultatAncrage {
    tsa_url: string;
    anchor_id: number;
    created: boolean;
    error?: string;
}

/** Verdict de la confrontation témoin ↔ base (VerifyWitness). */
export interface VerdictTemoin {
    verdict: 'CONFORME' | 'REECRITURE_DETECTEE' | 'CHAINE_CORROMPUE' | 'TOKEN_INVALIDE' | 'SIGNATURE_INVALIDE';
    sealedAt?: string;
    coverageSeq?: number;
    brokenSeq?: number;
    tsaName?: string;
    hashHex?: string;
    message: string;
}

export async function fetchVerification(): Promise<VerificationChaine> {
    try {
        const rep = await apiInstance.get<VerificationChaine>(`${ENDPOINT_REGISTRE}/verification`);
        return rep.data;
    } catch (error) {
        throw handleAxiosError(error);
    }
}

export async function fetchAncres(): Promise<Ancre[]> {
    try {
        const rep = await apiInstance.get<Ancre[]>(`${ENDPOINT_REGISTRE}/ancres`);
        return rep.data;
    } catch (error) {
        throw handleAxiosError(error);
    }
}

export async function ancrerMaintenant(): Promise<ResultatAncrage[]> {
    try {
        const rep = await apiInstance.post<{ results: ResultatAncrage[] }>(`${ENDPOINT_REGISTRE}/ancrage`);
        return rep.data.results;
    } catch (error) {
        throw handleAxiosError(error);
    }
}

/**
 * Dépose un témoin pour vérification. `token` accepte tout ce que l'auditeur
 * peut avoir sous la main : le contenu base64 d'un .tsr, un bloc PEM, ou le
 * collage brut depuis le courriel — le serveur décode avec tolérance.
 * `tsaCert` est le certificat PEM optionnel ; à défaut, le serveur se rabat
 * sur son certificat racine configuré.
 */
export async function verifierTemoin(token: string, tsaCert: string): Promise<VerdictTemoin> {
    try {
        const rep = await apiInstance.post<VerdictTemoin>(`${ENDPOINT_REGISTRE}/verification-temoin`, {
            token,
            tsa_cert: tsaCert,
        });
        return rep.data;
    } catch (error) {
        throw handleAxiosError(error);
    }
}
