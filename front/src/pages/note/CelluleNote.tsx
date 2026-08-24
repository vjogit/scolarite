/**
 * L'affichage d'une note calculée, provenance comprise.
 *
 * Forme sobre, en une cellule : le cas ordinaire ne se signale pas, les deux
 * autres se nomment. Voir `provenance.ts` pour ce que chacun recouvre.
 */

import { Box, Chip, Typography } from '@mui/material';

import {
    formatNote, LIBELLE_NON_EVALUEE, ORIGINE_RATTRAPAGE, type Provenance,
} from './provenance';

/**
 * Visible des seuls lecteurs d'écran. La puce « Rattrapage » tient dans une
 * colonne, la phrase qui l'explique non ; et une infobulle sur une puce non
 * focalisable ne serait lisible ni au clavier ni au toucher.
 */
const POUR_LECTEUR_ECRAN = {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
} as const;

interface Props {
    readonly valeur: number | null | undefined;
    readonly provenance: Provenance | undefined;
}

export function CelluleNoteCalculee({ valeur, provenance }: Props) {
    // Une valeur absente est « non évaluée », que le serveur l'ait nommée ou
    // non : le `null` et la provenance disent la même chose, et l'affichage ne
    // doit pas dépendre de leur accord.
    if (valeur == null || provenance === 'non_evaluee') {
        return (
            <Typography component="span" variant="body2" color="text.secondary">
                {LIBELLE_NON_EVALUEE}
            </Typography>
        );
    }

    const texte = formatNote.format(valeur);

    if (provenance === 'rattrapage') {
        return (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                {texte}
                <Chip size="small" variant="outlined" color="secondary" label="Rattrapage" />
                <Box component="span" sx={POUR_LECTEUR_ECRAN}>{ORIGINE_RATTRAPAGE}</Box>
            </Box>
        );
    }

    return <>{texte}</>;
}
