/**
 * L'affichage d'une note calculée, provenance comprise.
 *
 * Forme sobre, en une cellule : le cas ordinaire ne se signale pas, les deux
 * autres se nomment. Voir `provenance.ts` pour ce que chacun recouvre.
 */

import { useTranslation } from 'react-i18next';

import { Badge } from '../../components/ui/badge';
import {
    formatNote, libelleNonEvaluee, origineRattrapage, type Provenance,
} from './provenance';

interface Props {
    readonly valeur: number | null | undefined;
    readonly provenance: Provenance | undefined;
}

export function CelluleNoteCalculee({ valeur, provenance }: Props) {
    const { t } = useTranslation('note');
    // Une valeur absente est « non évaluée », que le serveur l'ait nommée ou
    // non : le `null` et la provenance disent la même chose, et l'affichage ne
    // doit pas dépendre de leur accord.
    if (valeur == null || provenance === 'non_evaluee') {
        return <span className="text-sm text-muted-foreground">{libelleNonEvaluee()}</span>;
    }

    const texte = formatNote.format(valeur);

    if (provenance === 'rattrapage') {
        return (
            <span className="inline-flex items-center gap-1.5">
                {texte}
                <Badge variant="outline">{t('celluleNote.rattrapage')}</Badge>
                {/* Visible des seuls lecteurs d'écran. La puce « Rattrapage »
                    tient dans une colonne, la phrase qui l'explique non ; et une
                    infobulle sur une puce non focalisable ne serait lisible ni
                    au clavier ni au toucher. */}
                <span className="sr-only">{origineRattrapage()}</span>
            </span>
        );
    }

    return <>{texte}</>;
}
