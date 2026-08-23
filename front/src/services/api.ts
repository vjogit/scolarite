import axios from 'axios';
import Keycloak from 'keycloak-js';


export const apiInstance = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});


let axosInit = false
let refreshPromise: Promise<boolean> | null = null;

export function setupAxiosInterceptors(keycloak: Keycloak) {
    if (axosInit) {
        console.log("setupAxiosInterceptors deja appelee")
        return
    }
    // Intercepteur pour injecter le token automatiquement
    apiInstance.interceptors.request.use(async (config) => {
        try {
            // Vérifie si le token expire dans moins de 30s et le rafraîchit si nécessaire.
            // On utilise une promesse partagée pour éviter que plusieurs requêtes simultanées 
            // ne déclenchent plusieurs rafraîchissements en parallèle.
            if (!refreshPromise) {
                refreshPromise = keycloak.updateToken(30).finally(() => {
                    refreshPromise = null;
                });
            }
            await refreshPromise;

            const token = keycloak.token;
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch (error) {
            console.error("Erreur lors du rafraîchissement du token", error);
            // Dernier recours : si la déconnexion échoue à son tour, plus rien
            // ne le dirait — l'utilisateur resterait sur un jeton mort.
            keycloak.logout().catch((erreur: unknown) => {
                console.error("Échec de la déconnexion après un rafraîchissement raté", erreur);
            });
        }
        return config;
    });

    axosInit = true
}