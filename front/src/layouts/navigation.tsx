import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { DoorOpen, GraduationCap, ShieldCheck, Trash2, UserCog } from 'lucide-react';

import { Role, ROLES_FONCTIONNELS, USER_WORKFLOW } from '../pages/user/def';
import { SALLE_WORKFLOW } from '../pages/salle/def';
import { CORBEILLE_WORKFLOW } from '../pages/corbeille/def';
import { REGISTRE_WORKFLOW } from '../pages/registre/def';
import { SEGMENT_SCOLARITE } from '../services/context/RetourScolarite';
import { possedeTousLesRoles, possedeUnRole } from '../services/context/workflows';

/**
 * Une entrée du menu latéral — donnée pure, sans dépendance au composant qui
 * la dessine (le type venait de Toolpad ; il est local depuis sa sortie).
 */
export interface NavigationItemWithRoles {
  kind?: 'divider';
  segment?: string;
  title?: string;
  icon?: ReactNode;
  requiredRoles?: string[];
  /** Sémantique ET : tous ces rôles sont exigés (corbeille = composite ADMIN). */
  requiresAllRoles?: readonly string[];
  children?: NavigationItemWithRoles[];
}

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
export function construireNavigation(t: TFunction<'app'>): NavigationItemWithRoles[] {
  return [
    {
      segment: SEGMENT_SCOLARITE,
      title: t('nav.scolarite'),
      icon: <GraduationCap />,
      requiredRoles: [Role.CONSULTATION],
    },
    { kind: 'divider' },
    {
      // Segment composé : Salle a quitté le dossier « Planning », vidé de ses
      // autres entrées, sans que son URL bouge.
      segment: `planning/${SALLE_WORKFLOW}`,
      title: t('nav.salle'),
      icon: <DoorOpen />,
      requiredRoles: [Role.CONSULTATION],
    },
    {
      segment: USER_WORKFLOW,
      title: t('nav.utilisateur'),
      icon: <UserCog />,
      requiredRoles: [Role.CONSULTATION],
    },
    {
      segment: CORBEILLE_WORKFLOW,
      title: t('nav.corbeille'),
      icon: <Trash2 />,
      // Réservée aux porteurs de tous les rôles fonctionnels — le composite
      // ADMIN, sans jamais tester son nom.
      requiresAllRoles: ROLES_FONCTIONNELS,
    },
    {
      segment: REGISTRE_WORKFLOW,
      title: t('nav.registre'),
      icon: <ShieldCheck />,
      // Même règle que la corbeille : intégrité, ancrage et témoins sont des
      // gestes d'administration.
      requiresAllRoles: ROLES_FONCTIONNELS,
    },
  ];
}

export const filterNavigationByRoles = (
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
