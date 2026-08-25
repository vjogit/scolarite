import https from 'node:https';
import { BASE_URL } from './baseUrl';

/**
 * Garde de démarrage : la suite présuppose une stack déjà lancée
 * (`make start-local-keep`), elle ne la lance pas. Sans ce garde, une stack
 * absente produirait une cascade de timeouts individuels par test au lieu
 * d'un échec immédiat et actionnable.
 */
export default async function verifierStack(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const requete = https.get(BASE_URL, { rejectUnauthorized: false, timeout: 5_000 }, (reponse) => {
            reponse.destroy();
            resolve();
        });
        requete.on('timeout', () => { requete.destroy(); reject(new Error('délai dépassé')); });
        requete.on('error', (erreur: Error) => { reject(erreur); });
    }).catch((erreur: unknown) => {
        const message = erreur instanceof Error ? erreur.message : String(erreur);
        throw new Error(
            `Stack locale injoignable sur ${BASE_URL} (${message}).\n` +
            'Lancer d\'abord : make start-local-keep',
        );
    });
}
