import { useEffect } from 'react';
import LinearProgress from '@mui/material/LinearProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import Stack from '@mui/material/Stack';

import { Outlet, useLocation } from 'react-router';
import { DashboardLayout } from '@toolpad/core/DashboardLayout';
import { Account } from '@toolpad/core/Account';

import { useSession } from '../SessionContext';
import { createTheme, ThemeProvider, useColorScheme, type Theme } from '@mui/material/styles';
import { NotificationsProvider } from '@toolpad/core/useNotifications';
import { useKeycloak } from '../KeycloakContext';

/**
 * Les trois commandes qu'`Autocomplete` dessine lui-même — ouvrir, fermer,
 * effacer — tirent leur nom accessible de ces props, anglaises par défaut
 * (« Open », « Close », « Clear »). Six `Autocomplete` sont montés dans
 * l'application ; les nommer un par un multiplierait les endroits où la même
 * chaîne devrait rester juste. Le thème est le seul endroit qui les tient
 * tous.
 */
const COMPOSANTS_FR = {
  MuiAutocomplete: {
    defaultProps: {
      openText: 'Ouvrir la liste',
      closeText: 'Fermer la liste',
      clearText: 'Effacer',
    },
  },
} as const;

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
  components: COMPOSANTS_FR,
});

const lightTheme = createTheme({
  palette: {
    mode: 'light',
  },
  components: COMPOSANTS_FR,
})

function CustomActions() {
  return (
    <Stack direction="row" alignItems="center">
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

  let theme: Theme
  if (mode == undefined || mode == 'system') {
    theme = systemeSombre ? darkTheme : lightTheme
  } else {
    theme = mode === 'dark' ? darkTheme : lightTheme
  }

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