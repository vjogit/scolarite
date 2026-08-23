import { Outlet } from 'react-router';
import { type Authentication, type NavigationItem } from '@toolpad/core/AppProvider';
import { ReactRouterAppProvider } from '@toolpad/core/react-router';
import { Role, ROLES_FONCTIONNELS, USER_WORKFLOW } from './pages/user/def';
import SessionContext from './SessionContext';
import React from 'react';
import { demarrerKeycloak, instantaneKeycloak, KeycloakContext, subscribeToKeycloak } from './KeycloakContext';
import Keycloak from 'keycloak-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/fr';
import { setupAxiosInterceptors } from './services/api';
import { ContexteHierarchieProvider } from './services/context/ContexteProvider';
import { possedeTousLesRoles, possedeUnRole } from './services/context/workflows';
import { CATALOG_WORKFLOW } from './pages/catalog/def';
import { NOTE_ELEVE, NOTE_WORKFLOW } from './pages/note/def';
import { CERTIFICATION_WORKFLOW } from './pages/certification/def';
import { JURY_WORKFLOW } from './pages/jury/def';
import { PROGRAMME_WORKFLOW } from './pages/programme/def';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { SALLE_WORKFLOW } from './pages/salle/def';
import { CORBEILLE_WORKFLOW } from './pages/corbeille/def';
import SchoolIcon from '@mui/icons-material/School';
import GradingIcon from '@mui/icons-material/Grading';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import GavelIcon from '@mui/icons-material/Gavel';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import DateRangeIcon from '@mui/icons-material/DateRange';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';



type NavigationItemWithRoles = NavigationItem & {
  requiredRoles?: string[];
  /** Sémantique ET : tous ces rôles sont exigés (corbeille = composite ADMIN). */
  requiresAllRoles?: readonly string[];
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
    segment: CORBEILLE_WORKFLOW,
    title: 'Corbeille',
    icon: <DeleteOutlineIcon />,
    // Réservée aux porteurs de tous les rôles fonctionnels — le composite
    // ADMIN, sans jamais tester son nom.
    requiresAllRoles: ROLES_FONCTIONNELS,
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


/**
 * La session telle que le jeton la décrit.
 *
 * `tokenParsed` est une signature d'index : chacun de ses champs arrive en
 * `any`, et les lire à deux endroits dupliquait autant d'accès non typés. Une
 * seule lecture, ici, avec les valeurs de repli.
 */
function sessionDepuis(kc: Keycloak) {
  const jeton = kc.tokenParsed;
  return {
    user: {
      name: typeof jeton?.preferred_username === 'string' ? jeton.preferred_username : '',
      email: typeof jeton?.email === 'string' ? jeton.email : '',
      roles: jeton?.realm_access?.roles ?? [],
    },
  };
}

export default function App() {


  // Keycloak est un magasin externe : on s'y abonne et on le lit, plutôt que
  // d'en recopier l'état dans React. Le rendu voit `null` tant que
  // l'initialisation n'a pas abouti, puis l'instance — sans qu'aucun effet
  // n'ait eu à poser d'état, ni à rendre l'application une seconde fois.
  React.useEffect(() => { demarrerKeycloak(); }, []);
  const keycloak = React.useSyncExternalStore(subscribeToKeycloak, instantaneKeycloak);
  const loading = keycloak === null;

  // La session est ce que le jeton décrit : une fonction pure de l'instance,
  // et non un état à tenir à jour. `setSession` reste dans le contrat du
  // contexte — Toolpad le lit — mais plus personne n'a de raison de l'appeler.
  const session = React.useMemo(
    () => (keycloak ? sessionDepuis(keycloak) : null),
    [keycloak],
  );

  const sessionContextValue = React.useMemo(
    () => ({
      session,
      setSession: () => {
        throw new Error("La session se déduit du jeton Keycloak : rien à poser.");
      },
    }),
    [session],
  );

  const filteredNavigation = React.useMemo(
    () => (
      filterNavigationByRoles(NAVIGATION, session?.user.roles)
    ),
    [session],
  );

  // L'intercepteur d'API est le seul véritable effet de bord qui reste : il
  // arme axios une fois l'instance prête.
  React.useEffect(() => {
    if (!keycloak) return;
    setupAxiosInterceptors(keycloak);
  }, [keycloak]);

  const AUTHENTICATION: Authentication = {
    // Toolpad exige les deux entrées ; l'entrée en session est faite par
    // Keycloak avant que l'application ne se monte, il n'y a rien à y faire.
    signIn: () => { /* la connexion est déclenchée par Keycloak lui-même */ },
    signOut: () => { void keycloak?.logout({ redirectUri: window.location.origin + '/' }); },
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
    .filter(item => possedeUnRole(userRoles, item.requiredRoles)
      && possedeTousLesRoles(userRoles, item.requiresAllRoles))
    .map(item => ({
      ...item,
      children: item.children
        ? filterNavigationByRoles(item.children, userRoles)
        : undefined,
    }))
    .filter(item => !item.children || item.children.length > 0);
};
