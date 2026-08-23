/**
 * Le garde de route par rôle.
 *
 * Hors de `main.tsx` : un composant défini dans un module qui n'exporte que
 * des routes ne peut pas être remplacé à chaud. C'est aussi le troisième
 * endroit où les rôles se lisent, avec la navigation et les descripteurs de
 * workflow — il mérite un module qu'on trouve en le cherchant.
 */

import { use, type ReactNode } from 'react';
import SessionContext from '../SessionContext';

export const RoleGuard = ({ children, roles, requireAll }: { children: ReactNode, roles: readonly string[], requireAll?: boolean }) => {
  const { session } = use(SessionContext);

  if (!session?.user) {
    return null;
  }

  // `requireAll` : sémantique ET, réservée à la corbeille (composite ADMIN,
  // exprimé par les huit rôles fonctionnels sans tester son nom).
  const userRoles = session.user.roles ?? [];
  const hasRole = requireAll
    ? roles.every(r => userRoles.includes(r))
    : roles.some(r => userRoles.includes(r));

  if (!hasRole) {
    return <div>Accès non autorisé</div>;
  }

  return <>{children}</>;
};
