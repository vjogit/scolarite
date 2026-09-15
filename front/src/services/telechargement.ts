/**
 * Remettre au navigateur un fichier reçu du serveur.
 *
 * Quatre écrans d'export répétaient la même séquence : envelopper la réponse
 * dans un Blob, fabriquer une ancre invisible, la cliquer, la retirer, libérer
 * l'URL. Recopiée, elle s'oubliait par endroits — `revokeObjectURL` manquant
 * fuit la mémoire tant que l'onglet vit, et le nom de fichier annoncé par le
 * serveur était lu de trois façons différentes, ou pas du tout.
 */

import { isAxiosError, type AxiosResponse } from 'axios';

import { ApiError, handleAxiosError, type ErrorResponse } from './crud/def';

/**
 * Le nom que le serveur annonce dans `content-disposition`, ou le repli.
 *
 * Les en-têtes d'une réponse axios sont typés de façon lâche : la lecture est
 * faite ici, une fois, et rend une chaîne ou rien.
 *
 * `attachment; filename="jury_3.xlsx"` → `jury_3.xlsx`
 */
export function nomDeFichierDepuis(reponse: AxiosResponse, defaut: string): string {
    const disposition: unknown = reponse.headers['content-disposition'];
    if (typeof disposition !== 'string') return defaut;
    const trouve = /filename="?([^"]+)"?/.exec(disposition);
    return trouve?.[1] ?? defaut;
}

/**
 * Déclenche le téléchargement du corps de la réponse.
 *
 * Le nom vient du serveur quand il en annonce un, du repli sinon. L'URL
 * temporaire est libérée dans tous les cas.
 */
export function telecharger(reponse: AxiosResponse<Blob>, nomParDefaut: string): void {
    const url = window.URL.createObjectURL(new Blob([reponse.data]));
    try {
        const lien = document.createElement('a');
        lien.href = url;
        lien.setAttribute('download', nomDeFichierDepuis(reponse, nomParDefaut));
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
    } finally {
        window.URL.revokeObjectURL(url);
    }
}

/**
 * L'erreur d'un téléchargement, relue pour le routage des messages.
 *
 * Une requête en `responseType: 'blob'` reçoit aussi ses erreurs en Blob :
 * l'enveloppe RFC 9457 y est intacte, mais `handleAxiosError` lit
 * `response.data` comme un objet déjà décodé et n'y verrait rien — un 503 du
 * service PDF s'afficherait comme « une erreur est survenue ». Le corps est
 * relu ici, une fois, pour rendre l'`ApiError` que `messageForError` route.
 */
export async function erreurDeTelechargement(erreur: unknown): Promise<unknown> {
    if (isAxiosError(erreur) && erreur.response && erreur.response.data instanceof Blob) {
        const contentType = String(erreur.response.headers['content-type'] ?? '');
        if (contentType.includes('application/problem+json')) {
            try {
                const texte = await erreur.response.data.text();
                return new ApiError(erreur.response.status, JSON.parse(texte) as ErrorResponse);
            } catch {
                // Corps illisible : le statut seul, message générique.
            }
        }
        return new ApiError(erreur.response.status, undefined);
    }
    return handleAxiosError(erreur);
}
