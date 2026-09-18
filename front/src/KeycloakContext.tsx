import * as React from 'react';
import Keycloak from 'keycloak-js';

export interface KeycloakContextType {
    keycloak: Keycloak | null;
    loading: boolean
}

/**
 * Keycloak vu comme un magasin externe.
 *
 * L'instance est un singleton de module, initialisé une fois, dont l'état
 * change une seule fois : de « en cours » à « prêt ». `useSyncExternalStore`
 * est fait pour ça — s'abonner, lire un instantané — et évite d'en recopier
 * l'état dans React, ce qui obligeait à poser trois `setState` dans un effet
 * et à rendre l'application deux fois au démarrage.
 *
 * Trois pièces séparées, parce qu'elles n'ont pas le même contrat :
 * `demarrerKeycloak` a le droit d'avoir un effet de bord, `instantaneKeycloak`
 * doit être pur et rendre une référence stable, `subscribeToKeycloak` prévient.
 */
let keycloakInstance: Keycloak | null = null;
let keycloakPret: Keycloak | null = null;

const observers = new Set<() => void>();

const notifyObservers = () => {
    observers.forEach(observer => { observer(); });
};

export const subscribeToKeycloak = (observer: () => void): (() => void) => {
    observers.add(observer);
    return () => {
        observers.delete(observer);
    };
};

/**
 * L'instantané lu à chaque rendu : l'instance une fois initialisée, `null`
 * tant qu'elle ne l'est pas. La même référence tant que rien ne change, sans
 * quoi React boucherait.
 */
export const instantaneKeycloak = (): Keycloak | null => keycloakPret;

/**
 * L'écran visé avant l'aller-retour Keycloak.
 *
 * `login-required` redirige vers Keycloak puis revient sur `redirectUri`, la
 * racine — les `valid_redirect_uris` du client ne connaissent qu'elle, et
 * c'est voulu. Un lien profond collé dans un onglet neuf, un rechargement
 * sur un écran : tout retombait sur `/catalog_context/formation` (défaut
 * documenté par navigation.spec.ts jusqu'au 17 septembre 2026). Le chemin
 * visé est donc mémorisé dans sessionStorage — propre à l'onglet, il survit
 * à la redirection et à rien d'autre — avant l'init, et rejoué par `App`
 * une fois l'instance prête (`consommerCheminAvantConnexion`). Rien n'est
 * mémorisé sur la racine ; sur le trajet retour (la racine avec le fragment
 * `state=` de Keycloak) l'entrée est laissée en place, c'est elle qu'on
 * vient rejouer. Sans sessionStorage, on retombe sur la racine comme avant.
 */
const CLE_CHEMIN_AVANT_CONNEXION = 'chemin-avant-connexion';

function memoriserCheminAvantConnexion(): void {
    const { pathname, search, hash } = window.location;
    try {
        if (pathname !== '/') sessionStorage.setItem(CLE_CHEMIN_AVANT_CONNEXION, pathname + search + hash);
        else if (!hash.includes('state=')) sessionStorage.removeItem(CLE_CHEMIN_AVANT_CONNEXION);
    } catch {
        // sessionStorage indisponible : le comportement d'avant, la racine.
    }
}

/** Le chemin mémorisé, s'il y en a un — lu une seule fois, puis effacé. */
export const consommerCheminAvantConnexion = (): string | null => {
    try {
        const chemin = sessionStorage.getItem(CLE_CHEMIN_AVANT_CONNEXION);
        sessionStorage.removeItem(CLE_CHEMIN_AVANT_CONNEXION);
        return chemin;
    } catch {
        return null;
    }
};

/** Crée et initialise l'instance, une seule fois. Rend celle qui existe. */
export const demarrerKeycloak = (): Keycloak => {
    if (keycloakInstance) return keycloakInstance;

    // Keycloak est proxifié sous l'origine de la page (/auth), par nginx comme
    // par Vite : aucune URL dans le bundle, voir services/api.ts.
    const instance = new Keycloak({
        url: `${window.location.origin}/auth`,
        realm: import.meta.env.VITE_KEYCLOAK_REALM,
        clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID
    });
    keycloakInstance = instance;

    // Un jeton déjà présent — remontage de l'application, retour arrière du
    // navigateur — signifie que l'initialisation a déjà eu lieu.
    if (instance.token) keycloakPret = instance;

    memoriserCheminAvantConnexion();
    instance.init({
        onLoad: 'login-required',
        // PKCE S256 : exigé par le client Keycloak (pkce_code_challenge_method),
        // un code d'autorisation intercepté est inutilisable sans le verifier.
        pkceMethod: 'S256',
        // Redirection restreinte à la racine : les valid_redirect_uris du
        // client n'autorisent plus le joker "/*". L'écran visé est rejoué
        // après coup (memoriserCheminAvantConnexion).
        redirectUri: window.location.origin + '/',
    }).then(() => {
        console.log("Keycloak initialized");
        keycloakPret = instance;
        notifyObservers();
    }).catch((error: unknown) => {
        console.error("Failed to initialize Keycloak", error);
    });

    return instance;
};

/** Conservé pour l'intercepteur d'API, qui a besoin de l'instance même non prête. */
export const getKeycloak = (): Keycloak => demarrerKeycloak();


export const KeycloakContext = React.createContext<KeycloakContextType>({
    keycloak: null,
    loading: true,
});


export const useKeycloak = () => React.use(KeycloakContext);

