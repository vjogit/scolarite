import { useLocation } from 'react-router';
import { useMemo } from 'react';
import type { CrudMode } from './def';

// Assurez-vous d'importer votre type et votre fonction
// import { extractRootPath, type CrudMode } from './votreFichierUtilitaire';

export function useRootPath(mode: CrudMode): string {
    const location = useLocation();

    const rootPath = useMemo(() => {
        return extractRootPath(location.pathname, mode);
    }, [location.pathname, mode]);

    return rootPath;
}

function extractRootPath(urlPath: string, mode: CrudMode): string {
    // 1. On ignore les éventuels paramètres d'URL (ex: ?param=1)
    // `split` rend toujours au moins un élément, y compris sur une chaîne vide.
    const [pathWithoutQuery = ''] = urlPath.split('?');

    // 2. On enlève un éventuel slash final pour éviter un segment vide
    const cleanPath = pathWithoutQuery.endsWith('/')
        ? pathWithoutQuery.slice(0, -1)
        : pathWithoutQuery;

    // 3. On découpe le chemin en tableau de segments
    const segments = cleanPath.split('/');

    // 4. On retire les segments finaux selon le mode
    switch (mode) {
        case 'list':
            break
        case 'create':
        case 'show':
            // "rootPath/new" ou "rootPath/10" : on retire 1 segment
            segments.pop();
            break;
        case 'edit':
            // "rootPath/10/edit" : on retire 2 segments ("edit" puis "10")
            segments.pop();
            segments.pop();
            break;
        default:
            throw new Error(`Mode non géré: ${String(mode)}`);
    }

    // 5. On reconstruit l'URL
    return segments.join('/');
}

/** Un segment d'URL est un identifiant s'il n'est fait que de chiffres. */
function isIdSegment(segment: string): boolean {
    return /^\d+$/.test(segment);
}

/**
 * Chemin de la liste parente, ou `null` quand il n'y en a pas.
 *
 * Toute imbrication de la hiérarchie CRUD prend la forme
 * `…/parent/:parentId/enfant` : un parent existe donc si et seulement si
 * l'avant-dernier segment est un identifiant. Retirer la paire
 * `:parentId/enfant` redonne alors la liste parente. À la racine d'un
 * workflow — `/user_workflow/user`, `/catalog_context/formation` — cet
 * avant-dernier segment est le nom du workflow : pas de parent.
 */
export function parentListPath(rootPath: string): string | null {
    const segments = rootPath.split('/');
    const penultieme = segments[segments.length - 2];

    if (penultieme === undefined || !isIdSegment(penultieme)) return null;

    const parent = segments.slice(0, -2).join('/');

    // Garde-fou : on ne navigue jamais vers une chaîne vide.
    return parent === '' ? null : parent;
}
