import type { TFunction } from 'i18next';

import crudFr from '../../i18n/locales/fr/crud.json';
import type { DeleteImpactEntry } from './def';

/**
 * Le libellé d'une ligne d'impact de suppression — « 3 promotions »,
 * « 1 fiche syllabus », « 1 847 notes » — dans la langue active.
 *
 * Le serveur livre une clé stable (`entity`, le nom de table) et un compte,
 * jamais un texte (convention du 17 septembre 2026, lot correction-langue) :
 * la traduction et l'accord en nombre vivent ici, dans le bloc `impact` de
 * `crud.json`, avec les pluriels d'i18next (`_one` / `_other`) et son
 * formateur de nombre (séparateur de milliers de la langue).
 *
 * Les natures connues sont dérivées du JSON français lui-même : une clé que le
 * serveur enverrait sans traduction s'affiche brute (« 2 foo »), visible dès
 * la première ouverture plutôt que silencieusement absente.
 */

type CleImpact = keyof typeof crudFr.impact;
type NatureCascade = CleImpact extends infer K ? (K extends `${infer N}_one` ? N : never) : never;
type CleDetache = keyof typeof crudFr.impact.detache;
type NatureDetachee = CleDetache extends infer K ? (K extends `${infer N}_one` ? N : never) : never;

function natures(bloc: Record<string, unknown>): ReadonlySet<string> {
    return new Set(Object.keys(bloc).filter((cle) => cle.endsWith('_one')).map((cle) => cle.slice(0, -'_one'.length)));
}
const NATURES_CASCADE = natures(crudFr.impact);
const NATURES_DETACHEES = natures(crudFr.impact.detache);

function estNatureCascade(entity: string): entity is NatureCascade {
    return NATURES_CASCADE.has(entity);
}
function estNatureDetachee(entity: string): entity is NatureDetachee {
    return NATURES_DETACHEES.has(entity);
}

/** Une ligne de cascade : ce que la suppression emporte. */
export function libelleImpact(entry: DeleteImpactEntry, t: TFunction<'crud'>): string {
    if (!estNatureCascade(entry.entity)) return `${entry.count} ${entry.entity}`;
    return t(`impact.${entry.entity}`, { count: entry.count });
}

/** Une ligne de détachement : ce qui survit mais perd son lien. */
export function libelleDetache(entry: DeleteImpactEntry, t: TFunction<'crud'>): string {
    if (!estNatureDetachee(entry.entity)) return `${entry.count} ${entry.entity}`;
    return t(`impact.detache.${entry.entity}`, { count: entry.count });
}
