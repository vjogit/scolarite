import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { useModeCouleur } from './modeCouleur';

/**
 * La bascule clair/sombre de l'en-tête — le premier consommateur de
 * `setMode` (invariant 12 : la résolution reste dans `modeCouleur.ts`, ce
 * bouton ne fait qu'écrire la préférence).
 *
 * Un interrupteur à deux positions, pas un menu à trois : il montre l'état
 * effectif (`estSombre`, donc celui du système tant que rien n'est choisi)
 * et enregistre l'opposé. « Système » n'a pas de position propre : c'est
 * l'état d'un navigateur qui n'a rien choisi, et effacer la préférence y
 * ramène. Rôle `switch`, libellé fixe (« Mode sombre »), état en
 * `aria-checked` — l'infobulle, elle, dit l'action.
 */
export function BasculeModeCouleur() {
    const { t } = useTranslation('app');
    const { estSombre, setMode } = useModeCouleur();

    return (
        <Tooltip>
            <TooltipTrigger
                render={(
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        role="switch"
                        aria-checked={estSombre}
                        aria-label={t('modeSombreAriaLabel')}
                        onClick={() => { setMode(estSombre ? 'light' : 'dark'); }}
                    />
                )}
            >
                {estSombre ? <Sun /> : <Moon />}
            </TooltipTrigger>
            <TooltipContent>{t(estSombre ? 'modeVersClair' : 'modeVersSombre')}</TooltipContent>
        </Tooltip>
    );
}
