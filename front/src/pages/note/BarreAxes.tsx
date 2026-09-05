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
import { useTranslation } from 'react-i18next';

import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group';
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
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
            <span id="libelle-axe-notes" className="text-sm text-muted-foreground">
                {t('barreAxes.axe')}
            </span>
            {/* Groupe à choix unique (`multiple` absent) : la même sémantique
                que le `ToggleButtonGroup exclusive` MUI — un `div role="group"`
                nommé par le libellé, des boutons `aria-pressed`. */}
            <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                value={courant === null ? [] : [courant.segment]}
                aria-labelledby="libelle-axe-notes"
                onValueChange={(segments) => {
                    // Recliquer l'axe actif le dépresse et rend une liste vide :
                    // il n'y a rien à faire, on y est déjà.
                    const segment = segments[0];
                    if (segment === undefined) return;
                    const axe = AXES.find(candidat => candidat.segment === segment);
                    if (axe === undefined) return;
                    void navigate(cheminVersAxe(pathname, axe));
                }}
            >
                {AXES.map(axe => (
                    <ToggleGroupItem key={axe.segment} value={axe.segment}>
                        {axe.libelle()}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </div>
    );
}
