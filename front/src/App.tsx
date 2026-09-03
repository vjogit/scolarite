import { Outlet } from 'react-router';
import SessionContext from './SessionContext';
import React from 'react';
import { demarrerKeycloak, instantaneKeycloak, KeycloakContext, subscribeToKeycloak } from './KeycloakContext';
import Keycloak from 'keycloak-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
// La locale FR de dayjs et son choix par langue i18next vivent désormais dans
// `services/ChampDate.tsx`, seul endroit qui formate des dates localisées —
// le rôle que jouait le `LocalizationProvider` (adapterLocale), retiré au
// lot 12 avec la dépose des pickers MUI.
import { setupAxiosInterceptors } from './services/api';
import { ContexteHierarchieProvider } from './services/context/ContexteProvider';

const queryClient = new QueryClient()

/**
 * Le thème racine ne sert qu'à une chose : porter `colorSchemes` pour que
 * `useColorScheme()` (mode clair/sombre/système, persistance comprise)
 * fonctionne partout — le rôle que jouait l'`AppProvider` de Toolpad. Le
 * thème concret des écrans reste celui de `layouts/dashboard.tsx`, qui
 * l'emboîte par-dessous ; `CssBaseline enableColorScheme` (rendu lui aussi
 * par Toolpad auparavant) garde la remise à zéro du corps de page.
 */
const themeRacine = createTheme({
  cssVariables: true,
  colorSchemes: { light: true, dark: true },
});

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
  // contexte, mais personne n'a de raison de l'appeler.
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

  // L'intercepteur d'API est le seul véritable effet de bord qui reste : il
  // arme axios une fois l'instance prête.
  React.useEffect(() => {
    if (!keycloak) return;
    setupAxiosInterceptors(keycloak);
  }, [keycloak]);

  return (
    <SessionContext value={sessionContextValue}>
      <KeycloakContext value={{ keycloak, loading }}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={themeRacine}>
            <CssBaseline enableColorScheme />
            {/* Le contexte résout des noms par l'API : il ne se monte qu'une
                fois l'intercepteur d'authentification en place, en même temps
                que les écrans — sinon ses requêtes partent sans jeton. */}
            {!loading && (
              <ContexteHierarchieProvider>
                <Outlet />
              </ContexteHierarchieProvider>
            )}
          </ThemeProvider>
        </QueryClientProvider>
      </KeycloakContext>
    </SessionContext>
  )

}
