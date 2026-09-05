/*
 * Mode clair/sombre de la page de connexion : suivre le choix fait dans
 * l'application.
 *
 * Le thème parent (keycloak.v2) pose la classe `pf-v5-theme-dark` sur <html>
 * d'après `prefers-color-scheme` — la préférence de l'OS, rien d'autre. Or
 * l'application laisse l'utilisateur choisir
 * (front/src/services/modeCouleur.ts : `light`, `dark` ou `system`,
 * enregistré dans localStorage sous la clé `mode-couleur`). Ce script relit
 * ce choix et corrige la classe :
 *  - `dark`  → classe posée, quel que soit l'OS ;
 *  - `light` → classe retirée, quel que soit l'OS ;
 *  - `system`, clé absente ou valeur inconnue → rien : le parent suit déjà
 *    l'OS, et c'est le comportement voulu.
 * Il ne résout rien lui-même (aucun `matchMedia` ici) : la classe reste le
 * seul décideur, css/custom.css ne fait que la suivre — même partage des
 * rôles que `.dark` posée par layouts/dashboard.tsx côté front.
 *
 * Limite : localStorage est propre à une origine. Le partage ne marche que
 * parce que Keycloak est servi SOUS L'ORIGINE DU FRONT, en /auth — par le
 * proxy de Vite hors conteneur (KC_HOSTNAME=https://10.20.2.1:5173/auth dans
 * infra/env/config-local.env) comme par nginx en conteneur et en prod
 * (KC_HOSTNAME_CONTENEURS, config-prod.env : https://…:9021/auth). Servi un
 * jour depuis une autre origine, ce script ne trouverait rien et se tairait :
 * le login suivrait l'OS, sans erreur.
 *
 * Course avec le parent : son script est un module `async` inline, le nôtre
 * un script classique chargé après lui dans <head> ; l'ordre d'exécution des
 * deux n'est pas garanti, et le parent réapplique l'OS à chaque changement
 * de `prefers-color-scheme` tant que la page est ouverte. D'où
 * l'observateur : à chaque mutation de la classe de <html>, le choix
 * enregistré est réaffirmé. Le rappel d'un MutationObserver est une
 * microtâche : il passe avant le premier rendu, pas de flash.
 *
 * Exécuté immédiatement, sans attendre DOMContentLoaded : <html> existe déjà
 * quand ce script s'exécute, et chaque instant d'attente serait un instant
 * rendu dans le mauvais mode.
 */
(function () {
    'use strict';

    var CLASSE_SOMBRE = 'pf-v5-theme-dark';
    var CLE_MODE = 'mode-couleur';

    var mode;
    try {
        mode = window.localStorage.getItem(CLE_MODE);
    } catch (erreur) {
        // Magasin inaccessible (navigation privée verrouillée) : le parent décide.
        return;
    }
    if (mode !== 'dark' && mode !== 'light') {
        return;
    }

    var racine = document.documentElement;
    var sombre = mode === 'dark';

    function appliquer() {
        // Ne toucher la classe que si elle contredit le choix : une écriture
        // inconditionnelle rappellerait l'observateur en boucle.
        if (racine.classList.contains(CLASSE_SOMBRE) !== sombre) {
            racine.classList.toggle(CLASSE_SOMBRE, sombre);
        }
    }

    appliquer();
    new MutationObserver(appliquer).observe(racine, { attributes: true, attributeFilter: ['class'] });
})();
