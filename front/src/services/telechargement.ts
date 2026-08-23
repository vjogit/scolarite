/**
 * Le nom d'un fichier téléchargé, tel que le serveur l'annonce.
 *
 * Les en-têtes d'une réponse axios sont typés de façon lâche : lire
 * `headers['content-disposition']` rend une valeur non typée, que trois écrans
 * d'export interrogeaient chacun à leur manière — d'où autant de chaînes
 * manipulées sans qu'aucun type ne les décrive. La lecture est faite ici, une
 * fois, et rend une chaîne ou rien.
 */

import type { AxiosResponse } from 'axios';

/** `attachment; filename="jury_3.xlsx"` → `jury_3.xlsx` */
export function nomDeFichierDepuis(reponse: AxiosResponse, defaut: string): string {
    const disposition: unknown = reponse.headers['content-disposition'];
    if (typeof disposition !== 'string') return defaut;
    const trouve = /filename="?([^"]+)"?/.exec(disposition);
    return trouve?.[1] ?? defaut;
}
