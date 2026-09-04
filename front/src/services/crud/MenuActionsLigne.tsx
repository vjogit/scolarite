/**
 * La colonne d'actions d'une ligne : une action directe, puis un menu.
 *
 * Composant unique de toutes les listes CRUD — il remplace à la fois les
 * colonnes d'icônes muettes et le `CertificationMenu` qui avait résolu le
 * problème pour un seul écran. Les entrées portent leur libellé en toutes
 * lettres : le sens ne dépend plus d'un survol, inexistant au tactile.
 */

import { Fragment, useCallback } from 'react';
import { EllipsisVertical } from 'lucide-react';
import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { libelleAction, type ActionLigne } from './actions';

interface Props<D extends FieldValues> {
    /** Déjà filtrées par les droits et ordonnées : ce composant n'arbitre rien. */
    readonly actions: readonly ActionLigne<D>[];
    /** Nom lisible de la ligne, pour le nom accessible du bouton de menu. */
    readonly nomLigne: string;
    readonly onChoisir: (action: ActionLigne<D>) => void;
}

export function MenuActionsLigne<D extends FieldValues>({ actions, nomLigne, onChoisir }: Props<D>) {
    const { t } = useTranslation('crud');

    // Le menu Base UI se ferme seul au choix d'une entrée : plus d'ancre à
    // tenir, `choisir` ne fait que remonter l'action.
    const choisir = useCallback((action: ActionLigne<D>) => {
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
        <div className="flex items-center">
            {directe && IconeDirecte && (
                <Tooltip>
                    <TooltipTrigger
                        render={(
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={libelleAction(directe)}
                                onClick={() => { choisir(directe); }}
                            />
                        )}
                    >
                        <IconeDirecte />
                    </TooltipTrigger>
                    <TooltipContent>{libelleAction(directe)}</TooltipContent>
                </Tooltip>
            )}

            {entrees.length > 0 && (
                <DropdownMenu>
                    {/* Base UI pose lui-même aria-haspopup/expanded/controls sur
                        le déclencheur ; seul le nom accessible reste à fournir —
                        il porte l'identité de la ligne : hors contexte visuel,
                        « Actions » seul ne dit pas de quoi. */}
                    <Tooltip>
                        <TooltipTrigger
                            render={(
                                <DropdownMenuTrigger
                                    render={(
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            aria-label={t('actions.menuLigne', { nom: nomLigne })}
                                        />
                                    )}
                                />
                            )}
                        >
                            <EllipsisVertical />
                        </TooltipTrigger>
                        <TooltipContent>{t('actions.menu')}</TooltipContent>
                    </Tooltip>
                    {/* `w-max` : la largeur suit la plus longue entrée, comme le
                        menu MUI — sans lui, `w-(--anchor-width)` cale le menu
                        sur le bouton ⋮ et replie les libellés sur deux lignes. */}
                    <DropdownMenuContent align="end" className="w-max">
                        {entrees.map((action, index) => {
                            const Icone = action.icone;
                            return (
                                <Fragment key={action.id}>
                                    {/* Séparateur avant le premier bloc destructif. */}
                                    {index === premiereDestructive && index > 0 && <DropdownMenuSeparator />}
                                    <DropdownMenuItem
                                        variant={action.destructive ? 'destructive' : 'default'}
                                        inset={!Icone}
                                        onClick={() => { choisir(action); }}
                                    >
                                        {Icone && <Icone />}
                                        {libelleAction(action)}
                                    </DropdownMenuItem>
                                </Fragment>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
}
