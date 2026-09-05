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
 *
 * Deux bascules n'ont pas le même coût, et rien ne le disait à l'avance :
 * vers un axe dont l'identifiant est déjà dans l'URL, l'écran de notes s'ouvre
 * aussitôt ; vers un axe dont il manque, `cheminVersAxe` dépose sur une liste
 * où le choix reste à faire — on cliquait « Contrôle » pour voir des notes et
 * on voyait une liste de matières. Le libellé de ces axes-là se termine par
 * des points de suspension, la convention qui annonce depuis toujours qu'un
 * choix précède l'action. Le suffixe est contextuel — il dépend du chemin, pas
 * de l'axe — et vient de l'i18n, jamais d'une concaténation : la typographie
 * des points diffère d'une langue à l'autre. Une couleur a été écartée : elle
 * porterait une valence (vert = bon) que l'information n'a pas, elle
 * entrerait en collision avec le vert des grades juste en dessous, et elle ne
 * transmettrait rien à qui ne la voit pas. Aucun état désactivé non plus :
 * ces axes fonctionnent, ils demandent seulement un choix de plus.
 */

import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group';
import { AXES, axeDirect, axeDuChemin, axesDisponibles, cheminVersAxe } from './axes';

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
                {AXES.map(axe => {
                    const libelle = axe.libelle();
                    return (
                        <ToggleGroupItem key={axe.segment} value={axe.segment}>
                            {axeDirect(pathname, axe) ? libelle : t('barreAxes.axeIndirect', { libelle })}
                        </ToggleGroupItem>
                    );
                })}
            </ToggleGroup>
        </div>
    );
}
