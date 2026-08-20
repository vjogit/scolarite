import { Outlet } from 'react-router';
import { type Authentication, type NavigationItem } from '@toolpad/core/AppProvider';
import { ReactRouterAppProvider } from '@toolpad/core/react-router';
import { Role, USER_WORKFLOW } from './pages/user/def';
import SessionContext, { type Session } from './SessionContext';
import React from 'react';
import { getKeycloak, KeycloakContext, subscribeToKeycloak } from './KeycloakContext';
import Keycloak from 'keycloak-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/fr';
import { setupAxiosInterceptors } from './services/api';
import { ContexteHierarchieProvider } from './services/context/ContexteProvider';
import { possedeUnRole } from './services/context/workflows';
import { CATALOG_WORKFLOW } from './pages/catalog/def';
import { NOTE_ELEVE, NOTE_WORKFLOW } from './pages/note/def';
import { CERTIFICATION_WORKFLOW } from './pages/certification/def';
import { JURY_WORKFLOW } from './pages/jury/def';
import { PROGRAMME_WORKFLOW } from './pages/programme/def';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { SALLE_WORKFLOW } from './pages/salle/def';
import SchoolIcon from '@mui/icons-material/School';
import GradingIcon from '@mui/icons-material/Grading';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import GavelIcon from '@mui/icons-material/Gavel';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import DateRangeIcon from '@mui/icons-material/DateRange';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';



type NavigationItemWithRoles = NavigationItem & {
  requiredRoles?: string[];
  children?: NavigationItemWithRoles[]
};

const NAVIGATION: NavigationItemWithRoles[] = [
  {
    segment: CATALOG_WORKFLOW,
    title: 'Formation',
    icon: <SchoolIcon />,
    requiredRoles: [Role.CONSULTATION],
  },
  {
    segment: 'resultat',
    title: 'Resultat',
    icon: <GradingIcon />,
    requiredRoles: [Role.CONSULTATION],
    children: [
      {
        segment: NOTE_WORKFLOW,
        title: 'Note',
        icon: <AnalyticsIcon />,
        requiredRoles: [Role.CONSULTATION],
      },
      {
        segment: NOTE_ELEVE,
        title: 'Note eleve',
        icon: <AssignmentIndIcon />,
        requiredRoles: [Role.CONSULTATION],
      },

      {
        segment: CERTIFICATION_WORKFLOW,
        title: 'Certification',
        icon: <WorkspacePremiumIcon />,
        requiredRoles: [Role.CONSULTATION],
      },
      {
        segment: JURY_WORKFLOW,
        title: 'Jury',
        icon: <GavelIcon />,
        requiredRoles: [Role.CONSULTATION],
      },
    ]
  },
  {
    segment: USER_WORKFLOW,
    title: 'Utilisateur',
    icon: <ManageAccountsIcon />,
    requiredRoles: [Role.CONSULTATION],
  },
  {
    segment: 'planning',
    title: 'Planning',
    icon: <CalendarMonthIcon />,
    requiredRoles: [Role.CONSULTATION],
    children: [
      {
        segment: PROGRAMME_WORKFLOW,
        title: 'Programme',
        icon: <DateRangeIcon />,
        requiredRoles: [Role.CONSULTATION],
      },
      {
        segment: SALLE_WORKFLOW,
        title: 'Salle',
        icon: <MeetingRoomIcon />,
        requiredRoles: [Role.CONSULTATION],
      },
    ]
  }
];

const BRANDING = {
  title: 'Gestionnaire Scolarite',
};

const queryClient = new QueryClient()


export default function App() {

  const [session, setSession] = React.useState<Session | null>(null);
  const [keycloak, setKeycloak] = React.useState<Keycloak | null>(null);
  const [loading, setLoading] = React.useState(true);

  const sessionContextValue = React.useMemo(
    () => ({
      session,
      setSession,
    }),
    [session],
  );

  const filteredNavigation = React.useMemo(
    () => (
      filterNavigationByRoles(NAVIGATION, session?.user?.roles)
    ),
    [session],
  );

  React.useEffect(() => {
    // Récupérer l'instance (elle sera initialisée si nécessaire)
    const kc = getKeycloak();

    // S'abonner aux notifications d'initialisation
    const unsubscribe = subscribeToKeycloak((initializedKeycloak) => {
      console.log("Keycloak instance initialized, updating state");
      setKeycloak(initializedKeycloak);
      setLoading(false);

      // Mettre à jour la session avec les infos utilisateur
      setSession({
        user: {
          name: initializedKeycloak.tokenParsed?.preferred_username || '',
          email: initializedKeycloak.tokenParsed?.email || '',
          roles: initializedKeycloak.tokenParsed?.realm_access?.roles || [],
        },
      });
      setupAxiosInterceptors(initializedKeycloak)
    });

    // Si déjà initialisé, mettre à jour immédiatement
    if (kc && kc.token) {
      setKeycloak(kc);
      setLoading(false);
      setSession({
        user: {
          name: kc.tokenParsed?.preferred_username || '',
          email: kc.tokenParsed?.email || '',
          roles: kc.tokenParsed?.realm_access?.roles || [],
        },
      });
      setupAxiosInterceptors(kc)
    }

    // Nettoyer l'abonnement au démontage du composant
    return () => {
      unsubscribe();
    };
  }, [setSession]);

  const AUTHENTICATION: Authentication = {
    signIn: () => { },
    signOut: () => { keycloak?.logout({ redirectUri: window.location.origin + '/' }) },
  };

  return (
    <SessionContext.Provider value={sessionContextValue}>
      <KeycloakContext.Provider value={{ keycloak, loading }}>
        <QueryClientProvider client={queryClient}>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
            <ReactRouterAppProvider
              navigation={filteredNavigation}
              branding={BRANDING}
              session={session}
              authentication={AUTHENTICATION}
              localeText={{
                accountSignInLabel: "Connexion",
                accountSignOutLabel: "Deconexion",
              }}
            >
              {/* Le contexte résout des noms par l'API : il ne se monte qu'une
                  fois l'intercepteur d'authentification en place, en même temps
                  que les écrans — sinon ses requêtes partent sans jeton. */}
              {!loading && (
                <ContexteHierarchieProvider>
                  <Outlet />
                </ContexteHierarchieProvider>
              )}
            </ReactRouterAppProvider>
          </LocalizationProvider>
        </QueryClientProvider>
      </KeycloakContext.Provider>
    </SessionContext.Provider >
  )

}

const filterNavigationByRoles = (
  navigation: NavigationItemWithRoles[],
  userRoles: string[] | undefined
): NavigationItemWithRoles[] => {
  return navigation
    .filter(item => possedeUnRole(userRoles, item.requiredRoles))
    .map(item => ({
      ...item,
      children: item.children
        ? filterNavigationByRoles(item.children, userRoles)
        : undefined,
    }))
    .filter(item => !item.children || item.children.length > 0);
};
