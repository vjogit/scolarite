import { StrictMode, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Role, ROLES_FONCTIONNELS, USER_WORKFLOW } from './pages/user/def.tsx';
import Layout from './layouts/dashboard';
import { CatalogLayout, CatalogIndex, CATALOG_WORKFLOW } from './pages/catalog/CatalogLayout.tsx';

import { NoteIndex, NoteLayout } from './pages/note/NoteLayout.tsx';
import SessionContext from './SessionContext';
import { CertificationIndex, CertificationLayout } from './pages/certification/CertificationLayout.tsx';


import { createCatalogHierarchyRoutes } from './pages/catalog/routes.tsx';
import { createCertificationHierarchyRoutes } from './pages/certification/routes.tsx';
import { CERTIFICATION_WORKFLOW } from './pages/certification/def.ts';
import { createNoteHierarchyRoutes } from './pages/note/routes.tsx';
import { NOTE_ELEVE, NOTE_WORKFLOW } from './pages/note/def.ts';
import { NoteEleveDetail } from './pages/note/NoteEleveLayout.tsx';
import { JuryIndex, JuryLayout } from './pages/jury/JuryLayout.tsx';
import { createJuryHierarchyRoutes } from './pages/jury/routes.tsx';
import { JURY_WORKFLOW } from './pages/jury/def.ts';
import { createUserRoutes } from './pages/user/routes.tsx';
import { UserIndex, UserLayout } from './pages/user/UserLayout.tsx';
import { SALLE_WORKFLOW } from './pages/salle/def.ts';
import { SalleIndex, SalleLayout } from './pages/salle/SalleLayout.tsx';
import { createSalleRoutes } from './pages/salle/routes.tsx';
import { PROGRAMME_WORKFLOW, ProgrammeIndex, ProgrammeLayout } from './pages/programme/ProgrammeLayout.tsx';
import { createProgrammeHierarchyRoutes } from './pages/programme/routes.tsx';
import { CORBEILLE_WORKFLOW } from './pages/corbeille/def.ts';
import { CorbeillePage } from './pages/corbeille/Corbeille.tsx';




const RoleGuard = ({ children, roles, requireAll }: { children: React.ReactNode, roles: readonly string[], requireAll?: boolean }) => {
  const { session } = useContext(SessionContext);

  if (!session?.user) {
    return null;
  }

  // `requireAll` : sémantique ET, réservée à la corbeille (composite ADMIN,
  // exprimé par les huit rôles fonctionnels sans tester son nom).
  const userRoles = session.user.roles || [];
  const hasRole = requireAll
    ? roles.every(r => userRoles.includes(r))
    : roles.some(r => userRoles.includes(r));

  if (!hasRole) {
    return <div>Accès non autorisé</div>;
  }

  return <>{children}</>;
};

const routes = [
  {
    Component: App,
    children: [
      {
        path: '/',
        Component: Layout,
        children: [
          {
            path: USER_WORKFLOW,
            element: <RoleGuard roles={[Role.CONSULTATION]}><UserLayout /></RoleGuard>,
            children: [
              { index: true, Component: UserIndex },
              ...createUserRoutes()
            ]
          },
          {
            path: CATALOG_WORKFLOW,
            element: <RoleGuard roles={[Role.CONSULTATION]}><CatalogLayout /></RoleGuard>,
            children: [
              { index: true, Component: CatalogIndex },
              ...createCatalogHierarchyRoutes()
            ]
          },
          {
            path: 'resultat',
            children: [
              {
                path: NOTE_WORKFLOW,
                element: <RoleGuard roles={[Role.CONSULTATION]}><NoteLayout /></RoleGuard>,
                children: [
                  { index: true, Component: NoteIndex },
                  ...createNoteHierarchyRoutes(),
                ]
              },
              {
                path: CERTIFICATION_WORKFLOW,
                element: <RoleGuard roles={[Role.CONSULTATION]}><CertificationLayout /></RoleGuard>,
                children: [
                  { index: true, Component: CertificationIndex },
                  ...createCertificationHierarchyRoutes(),
                ]
              },
              {
                path: JURY_WORKFLOW,
                element: <RoleGuard roles={[Role.CONSULTATION]}><JuryLayout /></RoleGuard>,
                children: [
                  { index: true, Component: JuryIndex },
                  ...createJuryHierarchyRoutes(),
                ]
              },
              {
                path: NOTE_ELEVE,
                element: <RoleGuard roles={[Role.CONSULTATION]}><NoteEleveDetail /></RoleGuard>,
              },
            ]
          },
          {
            path: CORBEILLE_WORKFLOW,
            element: <RoleGuard roles={ROLES_FONCTIONNELS} requireAll><CorbeillePage /></RoleGuard>,
          },
          {
            path: 'planning',
            children: [
              {
                path: PROGRAMME_WORKFLOW,
                element: <RoleGuard roles={[Role.CONSULTATION]}><ProgrammeLayout /></RoleGuard>,
                children: [
                  { index: true, Component: ProgrammeIndex },
                  ...createProgrammeHierarchyRoutes()
                ]
              },
              {
                path: SALLE_WORKFLOW,
                element: <RoleGuard roles={[Role.CONSULTATION]}><SalleLayout /></RoleGuard>,
                children: [
                  { index: true, Component: SalleIndex },
                  ...createSalleRoutes(),
                ]
              },
            ]
          },
        ]
      }
    ]
  }
]

const router = createBrowserRouter(routes);



createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
