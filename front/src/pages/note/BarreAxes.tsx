/**
 * Le commutateur d'axe des notes.
 *
 * Cinq écrans disjoints donnaient à voir le même concept : la saisie d'un
 * contrôle, trois calculs, et un relevé d'élève accessible par une entrée de
 * menu séparée. Ils deviennent cinq axes d'un même écran, et l'axe est porté
 * par l'URL comme le reste du contexte — rechargement, partage et retour
 * navigateur le retrouvent sans qu'aucun état ne double le chemin.
 *
 * Le composant est monté une fois, par `NoteLayout`, entre la barre partagée et
 * l'écran. Il s'efface de lui-même au-dessus de la période, où il n'y a pas
 * encore d'axe à commuter.
 */

import { useLocation, useNavigate } from 'react-router';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { AXES, axeDuChemin, axesDisponibles, cheminVersAxe } from './axes';

export function BarreAxes() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation('note');

    if (!axesDisponibles(pathname)) return null;

    // `null` sur une liste intermédiaire — les UE d'une période, les contrôles
    // d'une matière : on y descend vers un axe sans y être encore.
    const courant = axeDuChemin(pathname);

    return (
        <Box
            sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2, py: 1, flexWrap: 'wrap',
                borderBottom: 1, borderColor: 'divider',
            }}
        >
            <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }} id="libelle-axe-notes">
                {t('barreAxes.axe')}
            </Typography>
            <ToggleButtonGroup
                exclusive
                size="small"
                value={courant?.segment ?? null}
                aria-labelledby="libelle-axe-notes"
                onChange={(_, segment: string | null) => {
                    // `exclusive` rend `null` quand on reclique l'axe actif :
                    // il n'y a rien à faire, on y est déjà.
                    if (segment === null) return;
                    const axe = AXES.find(candidat => candidat.segment === segment);
                    if (axe === undefined) return;
                    void navigate(cheminVersAxe(pathname, axe));
                }}
            >
                {AXES.map(axe => (
                    <ToggleButton
                        key={axe.segment}
                        value={axe.segment}
                        sx={{ textTransform: 'none' }}
                    >
                        {axe.libelle}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        </Box>
    );
}
