import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Les deux fichiers d'environnement que la suite lit — les mêmes que le
 * makefile. `make test-ihm` exporte `CONFIG_FILE_LOCAL` et
 * `SECRETS_FILE_LOCAL` (chemins relatifs à la racine du dépôt, `export`
 * global de makefile.local) ; un `npx playwright test` lancé directement,
 * sans ces variables, retombe sur les fichiers du poste. Une seule
 * résolution, pour le seed (`globalSetup.ts`) comme pour les comptes
 * (`chargerEnvLocal`) : avant ce point, les deux chemins étaient codés ici en
 * dur là où le makefile passait par ses variables — divergence relevée au
 * lot 5, que la CI aurait dû contourner (elle passe `config-ci.env` et
 * `secrets-ci.env` par ces mêmes variables, voir `.github/workflows/e2e.yml`).
 */
export function fichiersEnv(): { readonly config: string; readonly secrets: string } {
    const depuisEnv = (variable: string, defaut: string): string => {
        const valeur = process.env[variable];
        return valeur !== undefined && valeur !== '' ? valeur : defaut;
    };
    return {
        config: resolve(RACINE_DEPOT, depuisEnv('CONFIG_FILE_LOCAL', 'infra/env/config-local.env')),
        secrets: resolve(RACINE_DEPOT, depuisEnv('SECRETS_FILE_LOCAL', 'infra/env/secrets-local.env')),
    };
}

/**
 * Lit un fichier `infra/env/*.env` : lignes `CLE=valeur`, commentaires `#` et
 * lignes vides ignorés. Ne gère pas les guillemets (KC_SMTP_FROM_DISPLAY_NAME) :
 * aucune valeur lue ici n'en porte.
 */
function lireEnv(chemin: string): Record<string, string> {
    const contenu = readFileSync(chemin, 'utf-8');
    const valeurs: Record<string, string> = {};
    for (const ligneBrute of contenu.split('\n')) {
        const ligne = ligneBrute.trim();
        if (ligne === '' || ligne.startsWith('#')) continue;
        const index = ligne.indexOf('=');
        if (index === -1) continue;
        valeurs[ligne.slice(0, index)] = ligne.slice(index + 1);
    }
    return valeurs;
}

interface CompteTest {
    readonly username: string;
    readonly password: string;
}

export interface EnvLocal {
    readonly admin: CompteTest;
    readonly consultation: CompteTest;
    readonly notesEcriture: CompteTest;
}

/**
 * Identifiants des trois comptes de test, lus dans `infra/env/` — jamais en
 * dur dans les specs. Source unique avec `infra/keycloak/keycloak.tf` : ce
 * sont les mêmes fichiers qui alimentent le module Terraform.
 */
export function chargerEnvLocal(): EnvLocal {
    const fichiers = fichiersEnv();
    const config = lireEnv(fichiers.config);
    const secrets = lireEnv(fichiers.secrets);

    const requis = (cle: string, source: Record<string, string>): string => {
        const valeur = source[cle];
        if (!valeur) throw new Error(`${cle} absent ou vide dans infra/env/ — voir infra/env/README.md`);
        return valeur;
    };

    return {
        admin: {
            username: requis('KC_BOOTSTRAP_USER_USERNAME', config),
            password: requis('KC_BOOTSTRAP_USER_PASSWORD', secrets),
        },
        consultation: {
            username: requis('TEST_CONSULTATION_USER_USERNAME', config),
            password: requis('TEST_CONSULTATION_USER_PASSWORD', secrets),
        },
        notesEcriture: {
            username: requis('TEST_NOTES_ECRITURE_USER_USERNAME', config),
            password: requis('TEST_NOTES_ECRITURE_USER_PASSWORD', secrets),
        },
    };
}
