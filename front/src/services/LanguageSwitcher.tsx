import { useState, type MouseEvent } from 'react';
import { IconButton, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import { useTranslation } from 'react-i18next';

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
    const [ancre, setAncre] = useState<HTMLElement | null>(null);

    const ouvrir = (evenement: MouseEvent<HTMLElement>) => { setAncre(evenement.currentTarget); };
    const fermer = () => { setAncre(null); };
    const choisir = (code: string) => {
        void i18n.changeLanguage(code);
        fermer();
    };

    return (
        <>
            <Tooltip title={t('langueTooltip')}>
                <IconButton aria-label={t('langueAriaLabel')} onClick={ouvrir} size="small">
                    <TranslateIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Menu anchorEl={ancre} open={ancre !== null} onClose={fermer}>
                {LANGUES.map(({ code, libelle }) => (
                    <MenuItem key={code} selected={i18n.language.startsWith(code)} onClick={() => { choisir(code); }}>
                        <ListItemText>{libelle}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
