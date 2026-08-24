/**
 * Remettre au navigateur un fichier reçu du serveur.
 *
 * Quatre écrans d'export répétaient la même séquence : envelopper la réponse
 * dans un Blob, fabriquer une ancre invisible, la cliquer, la retirer, libérer
 * l'URL. Recopiée, elle s'oubliait par endroits — `revokeObjectURL` manquant
 * fuit la mémoire tant que l'onglet vit, et le nom de fichier annoncé par le
 * serveur était lu de trois façons différentes, ou pas du tout.
 */

import type { AxiosResponse } from 'axios';

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
