/**
 * L'annonce de nature d'un axe des notes — la même phrase sur les cinq
 * écrans : ce que l'écran est, dit par lui et non déduit de ce qu'il permet.
 *
 * Une note de nature, pas un avertissement : elle doit se lire, pas alerter.
 * D'où le contour seul et l'absence d'icône — la transposition de l'`Alert`
 * MUI `variant="outlined" icon={false}` que les trois écrans recopiaient.
 */

import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '../../components/ui/alert';
import type { Axe } from './axes';

export function AnnonceAxe({ axe }: { readonly axe: Axe }) {
    // L'annonce se résout dans la langue active à chaque rendu (`axes.ts`) ;
    // l'abonnement au namespace est ce qui provoque ce rendu à la bascule de
    // langue — `axe` est une constante de module, le React Compiler ne
    // rejouerait rien sur sa seule foi.
    useTranslation('note');

    return (
        <Alert variant="info" className="shrink-0 border-info/50 bg-transparent py-1">
            <AlertDescription className="text-foreground">{axe.annonce()}</AlertDescription>
        </Alert>
    );
}
