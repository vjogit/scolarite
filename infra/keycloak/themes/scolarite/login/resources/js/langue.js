/*
 * Langue de la page de connexion : suivre le choix fait dans l'application,
 * et lui rapporter celui fait ici — par la même variable, dans le même
 * localStorage, comme mode-couleur.js pour le clair/sombre.
 *
 * La variable existe déjà : le détecteur i18next du front
 * (front/src/i18n/config.ts) met la langue en cache sous la clé `i18nextLng`
 * (« fr », « en », parfois « fr-FR » quand elle vient du navigateur). Le
 * partage marche parce que Keycloak est servi SOUS L'ORIGINE DU FRONT, en
 * /auth, dans les deux modes (voir mode-couleur.js pour le détail).
 *
 * À la différence du mode couleur, la langue est rendue CÔTÉ SERVEUR
 * (FreeMarker) : un script ne peut pas retraduire la page. Il peut en
 * revanche la faire rendre à nouveau dans l'autre langue, par le paramètre
 * `kc_locale`, que Keycloak place au-dessus de tout dans sa résolution
 * (attribut de l'utilisateur, `ui_locales`, cookie, Accept-Language). Deux
 * règles, dans cet ordre :
 *
 *  1. L'URL courante porte `kc_locale=X`, X connue (fr, en) : X est écrite
 *     dans `i18nextLng`, et rien d'autre. C'est le sens login → application :
 *     un choix vient d'être fait, soit au sélecteur de langue de la page,
 *     soit par la règle 2 ; le détecteur i18next le reprendra au prochain
 *     démarrage de l'application.
 *  2. Sinon : la langue enregistrée (ramenée au code court) est comparée à
 *     celle de la page rendue — l'attribut `lang` de <html>, que le gabarit
 *     keycloak.v2 renseigne (« fr » / « en », vérifié au navigateur sur
 *     Keycloak 26.7.1). Connue et différente : la page est rechargée UNE
 *     fois dans la langue enregistrée. Clé absente, valeur inconnue ou déjà
 *     en accord : rien — Keycloak garde sa résolution propre, l'analogue du
 *     « system » du mode couleur.
 *
 * Aucune boucle possible : après le rechargement de la règle 2, l'URL porte
 * `kc_locale`, donc la règle 1 s'applique (le magasin, déjà égal, ne bouge
 * pas) et la règle 2 n'est plus consultée ; et un choix au sélecteur met le
 * magasin à jour (règle 1) avant que la règle 2 ne puisse le contredire.
 * Même si Keycloak ignorait le paramètre, la règle 1 s'appliquerait et le
 * rechargement ne se reproduirait pas : au plus une redirection par
 * affichage, quoi qu'il arrive.
 *
 * Comment recharger — constaté sur Keycloak 26.7.1 : `kc_locale` ajouté à
 * l'URL du point d'entrée OIDC (/protocol/openid-connect/auth?…), celle où
 * la page s'affiche d'abord, est IGNORÉ ; il n'est traité que sur les URL
 * `login-actions/…`, celles que le sélecteur de langue de la page produit
 * (avec `tab_id` et `execution`, qui gardent la session d'authentification).
 * Le script suit donc le lien du sélecteur pour la langue voulue — exactement
 * ce qu'un clic de l'utilisateur ferait —, jamais une URL fabriquée. Sans
 * sélecteur (un realm à une seule langue, une page qui n'en montre pas), il
 * n'y a rien à choisir : rien n'est fait. `location.replace` : le
 * rechargement ne laisse pas d'entrée dans l'historique.
 *
 * Le sélecteur est dans le corps de la page quand ce script s'exécute dans
 * <head> : la règle 2 attend qu'il soit analysé (observateur de mutations,
 * puis DOMContentLoaded en dernier recours), la règle 1 s'exécute tout de
 * suite. Tout est sous try/catch : localStorage peut être indisponible, et
 * la page de connexion doit rester utilisable quoi qu'il arrive.
 *
 * Limite assumée : localStorage est par navigateur. La langue ne suit pas
 * l'utilisateur d'un poste à l'autre — le même compromis, déjà accepté, que
 * pour le mode clair/sombre. Si ce besoin multi-appareils émerge, la voie
 * serait l'attribut utilisateur `locale` par le protocole (ui_locales +
 * claim + API Account), un chantier séparé.
 */
(function () {
    'use strict';

    var CLE_LANGUE = 'i18nextLng';
    var PARAMETRE = 'kc_locale';
    var LANGUES = ['fr', 'en'];

    function langueConnue(valeur) {
        return typeof valeur === 'string' && LANGUES.indexOf(valeur) !== -1;
    }

    /** « fr-FR » → « fr » ; null si la valeur n'est pas une langue connue. */
    function codeCourt(valeur) {
        if (typeof valeur !== 'string') {
            return null;
        }
        var code = valeur.split('-')[0].toLowerCase();
        return langueConnue(code) ? code : null;
    }

    /** Le lien du sélecteur de langue de la page pour `langue`, ou null. */
    function lienDuSelecteur(langue) {
        // keycloak.v2 rend un <select> dont chaque <option> vaut l'URL de
        // rechargement ; les thèmes plus anciens rendaient des <a>. Les deux
        // formes sont admises, par leur paramètre, jamais par leur libellé.
        var candidats = document.querySelectorAll('option[value*="' + PARAMETRE + '="], a[href*="' + PARAMETRE + '="]');
        for (var i = 0; i < candidats.length; i++) {
            var brut = candidats[i].tagName === 'A' ? candidats[i].getAttribute('href') : candidats[i].value;
            var url = new URL(brut, window.location.href);
            if (url.searchParams.get(PARAMETRE) === langue) {
                return url.href;
            }
        }
        return null;
    }

    /** Règle 2, tentée jusqu'à ce que le sélecteur soit dans le DOM. */
    function suivreLaLangueEnregistree(langue) {
        var termine = false;

        function tenter() {
            if (termine) {
                return;
            }
            var lien = lienDuSelecteur(langue);
            if (lien !== null) {
                termine = true;
                window.location.replace(lien);
            }
        }

        tenter();
        if (termine || document.readyState !== 'loading') {
            return;
        }
        var observateur = new MutationObserver(tenter);
        observateur.observe(document.documentElement, { childList: true, subtree: true });
        document.addEventListener('DOMContentLoaded', function () {
            observateur.disconnect();
            // Dernier essai : le sélecteur est là ou ne viendra plus.
            tenter();
            termine = true;
        });
    }

    try {
        var choixDansUrl = new URL(window.location.href).searchParams.get(PARAMETRE);
        if (choixDansUrl !== null) {
            // Règle 1 : un choix vient d'être fait, on le retient. Valeur
            // inconnue : on ne retient rien, et on ne recharge rien non plus.
            if (langueConnue(choixDansUrl)) {
                window.localStorage.setItem(CLE_LANGUE, choixDansUrl);
            }
            return;
        }

        // Règle 2.
        var enregistree = codeCourt(window.localStorage.getItem(CLE_LANGUE));
        var rendue = codeCourt(document.documentElement.getAttribute('lang'));
        if (enregistree === null || rendue === null || enregistree === rendue) {
            return;
        }
        suivreLaLangueEnregistree(enregistree);
    } catch (erreur) {
        // Magasin inaccessible ou URL inattendue : Keycloak décide seul.
    }
})();
