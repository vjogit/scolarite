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
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
// Enregistre la locale FR de dayjs sans l'activer globalement (dayjs reste
// en 'en' par défaut) : c'est `adapterLocale`, ci-dessous, qui choisit,
// instance par instance, en suivant la langue active de i18next.
import 'dayjs/locale/fr';
import { setupAxiosInterceptors } from './services/api';
import { ContexteHierarchieProvider } from './services/context/ContexteProvider';
import { possedeTousLesRoles, possedeUnRole } from './services/context/workflows';
import { SALLE_WORKFLOW } from './pages/salle/def';
import { CORBEILLE_WORKFLOW } from './pages/corbeille/def';
import { REGISTRE_WORKFLOW } from './pages/registre/def';
import { SEGMENT_SCOLARITE } from './services/context/RetourScolarite';
import SchoolIcon from '@mui/icons-material/School';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';



type NavigationItemWithRoles = NavigationItem & {
  requiredRoles?: string[];
  /** Sémantique ET : tous ces rôles sont exigés (corbeille = composite ADMIN). */
  requiresAllRoles?: readonly string[];
  children?: NavigationItemWithRoles[]
};

/**
 * Le menu latéral.
 *
 * Deux navigations coexistent, et la frontière entre elles est la règle à
 * suivre pour toute entrée future :
 *
 *   barre centrale = tâches ancrées sur le contexte hiérarchique ;
 *   menu latéral   = destinations globales, sans contexte.
 *
 * Les cinq tâches — Structure, Notes, Programme, Jury, Certifications — sont
 * dans `BarreWorkflows`, qui les fait basculer en conservant la position dans
 * la hiérarchie. Elles ont longtemps été ici *aussi*, avec un comportement
 * différent : le latéral rejouait le dernier chemin du workflow, l'onglet
 * tronquait le contexte courant. Deux résultats pour « aller au Jury ».
 *
 * Ne reste donc ici que ce qui ne dépend d'aucun contexte, plus « Scolarité »
 * qui ramène à la tâche en cours : sans elle, les salles, les utilisateurs et
 * la corbeille seraient des impasses.
 */
function construireNavigation(t: TFunction<'app'>): NavigationItemWithRoles[] {
  return [
    {
      segment: SEGMENT_SCOLARITE,
      title: t('nav.scolarite'),
      icon: <SchoolIcon />,
      requiredRoles: [Role.CONSULTATION],
    },
    { kind: 'divider' },
    {
      // Segment composé : Salle a quitté le dossier « Planning », vidé de ses
      // autres entrées, sans que son URL bouge.
      segment: `planning/${SALLE_WORKFLOW}`,
      title: t('nav.salle'),
      icon: <MeetingRoomIcon />,
      requiredRoles: [Role.CONSULTATION],
    },
    {
      segment: USER_WORKFLOW,
      title: t('nav.utilisateur'),
      icon: <ManageAccountsIcon />,
      requiredRoles: [Role.CONSULTATION],
    },
    {
      segment: CORBEILLE_WORKFLOW,
      title: t('nav.corbeille'),
      icon: <DeleteOutlineIcon />,
      // Réservée aux porteurs de tous les rôles fonctionnels — le composite
      // ADMIN, sans jamais tester son nom.
      requiresAllRoles: ROLES_FONCTIONNELS,
    },
    {
      segment: REGISTRE_WORKFLOW,
      title: t('nav.registre'),
      icon: <VerifiedUserIcon />,
      // Même règle que la corbeille : intégrité, ancrage et témoins sont des
      // gestes d'administration.
      requiresAllRoles: ROLES_FONCTIONNELS,
    },
  ];
}

/**
 * Le nom du produit ne se traduit pas : c'est une marque, pas un libellé —
 * comme « TOEIC » ou « ECTS » ailleurs dans l'application.
 */
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

  const { t, i18n } = useTranslation('app');

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
      filterNavigationByRoles(construireNavigation(t), session?.user.roles)
    ),
    [session, t],
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
    <SessionContext value={sessionContextValue}>
      <KeycloakContext value={{ keycloak, loading }}>
        <QueryClientProvider client={queryClient}>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={i18n.language}>
            <ReactRouterAppProvider
              navigation={filteredNavigation}
              branding={BRANDING}
              session={session}
              authentication={AUTHENTICATION}
              localeText={{
                accountSignInLabel: t('nav.connexion'),
                accountSignOutLabel: t('nav.deconnexion'),
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
      </KeycloakContext>
    </SessionContext>
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
