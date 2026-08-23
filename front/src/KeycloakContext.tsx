import * as React from 'react';
import Keycloak from 'keycloak-js';

export interface KeycloakContextType {
    keycloak: Keycloak | null;
    loading: boolean
}

// keycloakService.ts
let keycloakInstance: Keycloak | null = null;

// Système d'observateurs
type KeycloakObserver = (keycloak: Keycloak) => void;
const observers = new Set<KeycloakObserver>();

const notifyObservers = (keycloak: Keycloak) => {
    observers.forEach(observer => { observer(keycloak); });
};

export const subscribeToKeycloak = (observer: KeycloakObserver): (() => void) => {
    observers.add(observer);
    // Retourner une fonction de désabonnement
    return () => {
        observers.delete(observer);
    };
};


export const getKeycloak = () => {
    if (!keycloakInstance) {
        // Nommée avant d'être publiée : le rappel d'initialisation la reçoit
        // ainsi sans avoir à affirmer que la variable de module est remplie.
        const instance = new Keycloak({
            url: import.meta.env.VITE_KEYCLOAK_URL,
            realm: import.meta.env.VITE_KEYCLOAK_REALM,
            clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID
        });
        keycloakInstance = instance;

        instance.init({
            onLoad: 'login-required',
            // PKCE S256 : exigé par le client Keycloak (pkce_code_challenge_method),
            // un code d'autorisation intercepté est inutilisable sans le verifier.
            pkceMethod: 'S256',
            // Redirection restreinte à la racine : les valid_redirect_uris du
            // client n'autorisent plus le joker "/*".
            redirectUri: window.location.origin + '/',
        }).then(() => {
            console.log("Keycloak initialized");
            notifyObservers(instance);
        }).catch((error: unknown) => {
            console.error("Failed to initialize Keycloak", error);
        })
    }
    return keycloakInstance
};


export const KeycloakContext = React.createContext<KeycloakContextType>({
    keycloak: null,
    loading: true,
});


export const useKeycloak = () => React.useContext(KeycloakContext);

