import { useLocation, Link as RouterLink } from 'react-router';
import { Breadcrumbs, Link as MuiLink, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiInstance } from './api';

export const BREADCRUMB_PATH_NOT_USED = "__inutilise__"
// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration d'un segment d'URL dans le breadcrumb.
 * - `apiEntity`    : nom de la ressource API (ex: 'formation').
 *                    Si absent, le segment est affiché tel quel (ex: 'toic', 'cisco').
 * - `basePath`     : préfixe de l'URL API (défaut : '/api/v0/structure/')
 * - `nameResolver` : transforme la réponse API en libellé lisible (défaut : data.name)
 */
export interface BreadcrumbSegmentConfig {
    apiEntity: string;
    path: string;
    nameResolver: (data: any) => string;
    filteredSegments?: string[];
}

export type BreadcrumbEntityMap = Record<string, BreadcrumbSegmentConfig>;

// ─── BreadcrumbItem ───────────────────────────────────────────────────────────

function BreadcrumbItem({
    context,
    to,
    value,
    last,
    prevValue,
    label,
    entityMap,
}: {
    context: string;
    to: string;
    value: string;
    last: boolean;
    prevValue?: string;
    label?: string;
    entityMap: BreadcrumbEntityMap;
}) {
    const isId = !isNaN(Number(value));
    const prevConfig = prevValue ? entityMap[prevValue] : null;
    const apiEntity = isId ? (prevConfig?.apiEntity ?? prevValue) : null;
    const path = prevConfig?.path;
    const nameResolver = prevConfig?.nameResolver ?? ((d: any) => d.name);
  
    const { data } = useQuery({
        queryKey: [apiEntity, value],
        queryFn: async () => {
            const res = await apiInstance.get(`${path}/${value}`);
            return res.data;
        },
        enabled: !!apiEntity && !!path,
        staleTime: 5 * 60 * 1000,
    });

    let displayName = value;
    if (isId) {
        displayName = (data ? nameResolver(data) : null) || `#${value}`;
    } else if (value === context) {
        displayName = label || 'Breadcrumbs';
    }

    if (last) {
        return <Typography color="text.primary">{displayName}</Typography>;
    }

    return (
        <MuiLink component={RouterLink} underline="hover" color="inherit" to={to}>
            {displayName}
        </MuiLink>
    );
}

// ─── CommonBreadcrumbs ────────────────────────────────────────────────────────

export function CommonBreadcrumbs({
    context,
    label,
    entityMap,
}: {
    context: string;
    label: string;
    entityMap: BreadcrumbEntityMap;
}) {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter(Boolean);

    const filtered = new Set([
        'edit', 'new',
        ...Object.values(entityMap).flatMap(c => c.filteredSegments ?? []),
    ]);

    let currentPath = '';
    const breadcrumbs = pathnames.reduce<{ to: string; value: string; prevValue?: string }[]>(
        (acc, value, index) => {

            if (filtered.has(value)) {
                return acc;
            }

            currentPath += `/${value}`;

            // On ignore les segments qui sont des clés d'entités (ex: 'formation', 'promotion')
            // car ils ne sont pas affichés seuls dans le breadcrumb.
            if (!entityMap[value]?.apiEntity) {
                const nextSegment = pathnames[index + 1];
                const to = nextSegment ? `${currentPath}/${nextSegment}` : currentPath;
                acc.push({ to, value, prevValue: pathnames[index - 1] });
            }

            return acc;
        },
        []
    );

    return (
        <Breadcrumbs aria-label="breadcrumb" sx={{ p: 2 }}>
            {breadcrumbs.map((crumb, index) => (
                <BreadcrumbItem
                    key={crumb.to}
                    to={crumb.to}
                    value={crumb.value}
                    last={index === breadcrumbs.length - 1}
                    prevValue={crumb.prevValue}
                    context={context}
                    label={label}
                    entityMap={entityMap}
                />
            ))}
        </Breadcrumbs>
    );
}
