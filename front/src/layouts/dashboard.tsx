import { useEffect, useMemo } from 'react';
import LinearProgress from '@mui/material/LinearProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Link, Outlet, useLocation } from 'react-router';
import { Toaster } from 'sonner';

import { useSession } from '../SessionContext';
import { createTheme, ThemeProvider, useColorScheme, type Theme } from '@mui/material/styles';
import { useKeycloak } from '../KeycloakContext';
import { LanguageSwitcher } from '../services/LanguageSwitcher';
import { construireNavigation, filterNavigationByRoles } from './navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '../components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

/**
 * Le nom du produit ne se traduit pas : c'est une marque, pas un libellé —
 * comme « TOEIC » ou « ECTS » ailleurs dans l'application.
 */
const TITRE_PRODUIT = 'Gestionnaire Scolarite';

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

/**
 * Le menu latéral — les destinations globales, filtrées par rôles (le menu
 * masque, le serveur impose : `RoleGuard`/`RequireRole` restent la barrière).
 * La structure des entrées et la frontière avec la barre centrale sont
 * documentées dans `layouts/navigation.tsx`.
 */
function MenuLateral() {
  const { session } = useSession();
  const location = useLocation();
  const { t } = useTranslation('app');

  const entrees = filterNavigationByRoles(construireNavigation(t), session?.user.roles);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {entrees.map((entree, index) => {
                if (entree.kind === 'divider') {
                  // Un séparateur n'a pas d'identité propre : sa position est
                  // sa seule clé stable — même exception que les deux
                  // no-array-index-key documentées ailleurs.
                  // eslint-disable-next-line react-x/no-array-index-key
                  return <SidebarSeparator key={`divider-${index}`} className="my-1" />;
                }
                const chemin = `/${entree.segment ?? ''}`;
                return (
                  <SidebarMenuItem key={entree.segment}>
                    <SidebarMenuButton
                      isActive={location.pathname === chemin || location.pathname.startsWith(`${chemin}/`)}
                      tooltip={entree.title}
                      render={<Link to={chemin} />}
                    >
                      {entree.icon}
                      <span>{entree.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * Le menu de compte — remplaçant du `Account` de Toolpad : l'initiale de
 * l'utilisateur en déclencheur, nom et courriel en tête de menu, et la
 * déconnexion Keycloak comme seule action.
 */
function MenuCompte() {
  const { session } = useSession();
  const { keycloak } = useKeycloak();
  const { t } = useTranslation('app');

  const nom = session?.user.name ?? '';
  const initiale = (nom.charAt(0) || '?').toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('shell.compte')}
        className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
      >
        {initiale}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Base UI exige que GroupLabel vive dans un Group (erreur #31 sinon,
            constatée à l'écran — aucun test n'ouvre ce menu). */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block">{nom}</span>
            <span className="block text-xs font-normal text-muted-foreground">{session?.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => { void keycloak?.logout({ redirectUri: window.location.origin + '/' }); }}
          >
            <LogOut />
            {t('nav.deconnexion')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
      {/* `h-svh` + `overflow-hidden` reproduisent le cadre de Toolpad : la
          page ne défile jamais elle-même, seule la zone de contenu sous
          l'en-tête défile — les en-têtes collants des tables et le calendrier
          en dépendent. */}
      <SidebarProvider className="h-svh">
        <MenuLateral />
        <SidebarInset className="overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger aria-label={t('shell.basculerMenu')} />
            <span className="text-base font-medium">{TITRE_PRODUIT}</span>
            <div className="ml-auto flex items-center gap-2">
              <LanguageSwitcher />
              <MenuCompte />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  )
}
