/**
 * La colonne d'actions d'une ligne : une action directe, puis un menu.
 *
 * Composant unique de toutes les listes CRUD — il remplace à la fois les
 * colonnes d'icônes muettes et le `CertificationMenu` qui avait résolu le
 * problème pour un seul écran. Les entrées portent leur libellé en toutes
 * lettres : le sens ne dépend plus d'un survol, inexistant au tactile.
 */

import { useCallback, useId, useState, type MouseEvent } from 'react';
import {
    Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { FieldValues } from 'react-hook-form';

import type { ActionLigne } from './actions';

interface Props<D extends FieldValues> {
    /** Déjà filtrées par les droits et ordonnées : ce composant n'arbitre rien. */
    readonly actions: readonly ActionLigne<D>[];
    /** Nom lisible de la ligne, pour le nom accessible du bouton de menu. */
    readonly nomLigne: string;
    readonly onChoisir: (action: ActionLigne<D>) => void;
}

export function MenuActionsLigne<D extends FieldValues>({ actions, nomLigne, onChoisir }: Props<D>) {
    const [ancre, setAncre] = useState<null | HTMLElement>(null);
    const idMenu = useId();

    const ouvrir = useCallback((event: MouseEvent<HTMLButtonElement>) => {
        setAncre(event.currentTarget);
    }, []);
    const fermer = useCallback(() => { setAncre(null); }, []);

    const choisir = useCallback((action: ActionLigne<D>) => {
        setAncre(null);
        onChoisir(action);
    }, [onChoisir]);

    if (actions.length === 0) return null;

    // L'action directe est la première déclarée comme telle, à défaut la
    // première de la liste — « Voir » dans le cas général. Sans icône, rien à
    // dessiner dans un bouton nu : elle reste dans le menu.
    const directe = actions.find(action => action.directe && action.icone)
        ?? (actions[0]?.icone ? actions[0] : undefined);
    const entrees = actions.filter(action => action !== directe);

    const IconeDirecte = directe?.icone;
    const premiereDestructive = entrees.findIndex(action => action.destructive);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {directe && IconeDirecte && (
                <Tooltip title={directe.libelle}>
                    <IconButton aria-label={directe.libelle} onClick={() => { choisir(directe); }}>
                        <IconeDirecte />
                    </IconButton>
                </Tooltip>
            )}

            {entrees.length > 0 && (
                <>
                    <Tooltip title="Actions">
                        <IconButton
                            // Le nom porte l'identité de la ligne : hors contexte
                            // visuel, « Actions » seul ne dit pas de quoi.
                            aria-label={`Actions — ${nomLigne}`}
                            aria-haspopup="menu"
                            aria-expanded={ancre !== null}
                            aria-controls={ancre !== null ? idMenu : undefined}
                            onClick={ouvrir}
                        >
                            <MoreVertIcon />
                        </IconButton>
                    </Tooltip>
                    <Menu
                        id={idMenu}
                        anchorEl={ancre}
                        open={ancre !== null}
                        onClose={fermer}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    >
                        {entrees.map((action, index) => {
                            const Icone = action.icone;
                            const item = (
                                <MenuItem
                                    key={action.id}
                                    onClick={() => { choisir(action); }}
                                    sx={action.destructive ? { color: 'error.main' } : undefined}
                                >
                                    {Icone && (
                                        <ListItemIcon sx={action.destructive ? { color: 'error.main' } : undefined}>
                                            <Icone fontSize="small" />
                                        </ListItemIcon>
                                    )}
                                    <ListItemText inset={!Icone}>{action.libelle}</ListItemText>
                                </MenuItem>
                            );
                            // Séparateur avant le premier bloc destructif.
                            return index === premiereDestructive && index > 0
                                ? [<Divider key={`${action.id}-separateur`} />, item]
                                : item;
                        })}
                    </Menu>
                </>
            )}
        </Box>
    );
}
