import TranslateIcon from '@mui/icons-material/Translate';
import { useTranslation } from 'react-i18next';

import { Button } from '../components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { cn } from '../lib/utils';

/**
 * Le nom d'une langue s'écrit dans elle-même, quelle que soit la langue
 * active : « English » reste « English » sur une interface en français, et
 * réciproquement. Ce ne sont donc pas des clés à traduire.
 */
const LANGUES = [
    { code: 'fr', libelle: 'Français' },
    { code: 'en', libelle: 'English' },
] as const;

export function LanguageSwitcher() {
    const { t, i18n } = useTranslation('app');

    // Le menu Base UI se ferme seul au choix d'une entrée : plus d'ancre à tenir.
    const choisir = (code: string) => {
        void i18n.changeLanguage(code);
    };

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger
                    render={(
                        <DropdownMenuTrigger
                            render={(
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('langueAriaLabel')}
                                />
                            )}
                        />
                    )}
                >
                    <TranslateIcon fontSize="small" />
                </TooltipTrigger>
                <TooltipContent>{t('langueTooltip')}</TooltipContent>
            </Tooltip>
            {/* `w-max` : la largeur suit la plus longue entrée, pas le bouton
                icône (piège du lot 4). */}
            <DropdownMenuContent align="end" className="w-max">
                {LANGUES.map(({ code, libelle }) => (
                    <DropdownMenuItem
                        key={code}
                        // La langue active se distingue, comme le `selected`
                        // du MenuItem MUI — le rôle reste `menuitem`.
                        className={cn(i18n.language.startsWith(code) && 'bg-accent font-medium')}
                        onClick={() => { choisir(code); }}
                    >
                        {libelle}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
