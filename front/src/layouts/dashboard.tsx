import { useEffect, useMemo } from 'react';
import LinearProgress from '@mui/material/LinearProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import Stack from '@mui/material/Stack';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Outlet, useLocation } from 'react-router';
import { DashboardLayout } from '@toolpad/core/DashboardLayout';
import { Account } from '@toolpad/core/Account';

import { useSession } from '../SessionContext';
import { createTheme, ThemeProvider, useColorScheme, type Theme } from '@mui/material/styles';
import { NotificationsProvider } from '@toolpad/core/useNotifications';
import { Toaster } from 'sonner';
import { useKeycloak } from '../KeycloakContext';
import { LanguageSwitcher } from '../services/LanguageSwitcher';

/**
 * Les trois commandes qu'`Autocomplete` dessine lui-même — ouvrir, fermer,
 * effacer — tirent leur nom accessible de ces props, anglaises par défaut
 * (« Open », « Close », « Clear »). Six `Autocomplete` sont montés dans
 * l'application ; les nommer un par un multiplierait les endroits où la même
 * chaîne devrait rester juste. Le thème est le seul endroit qui les tient
 * tous.
 */
function composantsTraduits(t: TFunction<'app'>) {
  return {
    MuiAutocomplete: {
      defaultProps: {
        openText: t('autocomplete.ouvrir'),
        closeText: t('autocomplete.fermer'),
        clearText: t('autocomplete.effacer'),
      },
    },
  } as const;
}

function CustomActions() {
  return (
    <Stack direction="row" alignItems="center">
      <LanguageSwitcher />
      <Account
        slotProps={{
          preview: { slotProps: { avatarIconButton: { sx: { border: '0' } } } },
        }}
      />
    </Stack>
  );
}

export default function Layout() {
  const { session } = useSession()
  const location = useLocation()
  const { mode } = useColorScheme()
  const { keycloak, loading } = useKeycloak()
  const { t } = useTranslation('app')

  const { darkTheme, lightTheme } = useMemo(() => {
    const composants = composantsTraduits(t);
    return {
      darkTheme: createTheme({ palette: { mode: 'dark' }, components: composants }),
      lightTheme: createTheme({ palette: { mode: 'light' }, components: composants }),
    };
  }, [t]);

  // La redirection vers Keycloak est un effet de bord : la déclencher pendant
  // le rendu rendait `Layout` impur, et React se réserve le droit de rejouer un
  // rendu — ce qui déclenchait la redirection deux fois.
  useEffect(() => {
    if (loading || session) return;
    void keycloak?.login({
      redirectUri: window.location.origin + location.pathname + location.search,
    });
  }, [loading, session, keycloak, location.pathname, location.search]);

  // `useMediaQuery` s'abonne à la préférence système ; la lecture directe de
  // `window.matchMedia` pendant le rendu marchait, mais seulement parce que
  // `useColorScheme` ci-dessus s'y abonne pour son compte et provoque le rendu.
  // Le composant dépendait donc d'un abonnement posé par un voisin.
  const systemeSombre = useMediaQuery('(prefers-color-scheme: dark)');

  const estSombre = (mode == undefined || mode == 'system') ? systemeSombre : mode === 'dark';
  const theme: Theme = estSombre ? darkTheme : lightTheme;

  // Source unique du mode sombre : MUI résout `estSombre` ci-dessus (thème
  // + préférence système) ; Tailwind/shadcn n'ont pas leur propre logique de
  // résolution, ils suivent la classe `.dark` posée ici sur `<html>` — celle
  // qu'attend `@custom-variant dark (&:is(.dark *))` dans src/index.css.
  // Ne pas dupliquer cette résolution ailleurs (voir invariant CLAUDE.md).
  //
  // Posé AVANT les `return` anticipés ci-dessous (loading/session) : les
  // Hooks doivent s'exécuter à chaque rendu quel que soit le chemin de sortie
  // — sans quoi l'écran de chargement et l'écran de connexion resteraient
  // toujours clairs, quel que soit le mode choisi.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', estSombre);
  }, [estSombre]);

  if (loading) {
    return (
      <div style={{ width: '100%' }}>
        <LinearProgress />
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ width: '100%' }}>
        <LinearProgress />
      </div>
    );
  }

  return (
    <NotificationsProvider
      slotProps={{
        snackbar: {
          anchorOrigin: { vertical: 'top', horizontal: 'center' },
        },
      }}
    >
      <ThemeProvider theme={theme}>
        {/* Notifications applicatives (services/notify.ts). Haut/centre : la
            même ancre que l'ancien snackbar Toolpad — le positionnement fait
            partie de l'apparence. Le thème suit `estSombre`, la résolution
            unique faite ci-dessus (invariant CLAUDE.md #12) : pas de
            re-résolution `system` ici. */}
        <Toaster
          position="top-center"
          closeButton
          richColors
          theme={estSombre ? 'dark' : 'light'}
        />
        <DashboardLayout
          slots={{
            toolbarActions: CustomActions
          }}
          sx={{
            background: theme.palette.background.default,
            backgroundColor: theme.palette.background.default
          }}
        >
          <Outlet />
        </DashboardLayout>
      </ThemeProvider>

    </NotificationsProvider>
  )
}