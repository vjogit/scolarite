import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';

import { Outlet, useLocation } from 'react-router';
import { DashboardLayout } from '@toolpad/core/DashboardLayout';
import { Account } from '@toolpad/core/Account';

import { useSession } from '../SessionContext';
import { createTheme, ThemeProvider, useColorScheme, type Theme } from '@mui/material/styles';
import { NotificationsProvider } from '@toolpad/core/useNotifications';
import { useKeycloak } from '../KeycloakContext';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
  },
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

  var theme: Theme
  if (mode == undefined || mode == 'system') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? darkTheme : lightTheme
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
    keycloak?.login({
      redirectUri: window.location.origin + location.pathname + location.search
    })
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