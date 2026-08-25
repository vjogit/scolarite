import type { TFunction } from 'i18next';
import i18n from '../../i18n/config';

export const USER = "user"
export const USER_WORKFLOW = "user_workflow"

export const ENDPOINT_USER = `/api/v0/${USER}`


// Rôles attribuables — miroir de services.AssignableRoles côté serveur.
// ADMIN est un composite Keycloak de tous les rôles fonctionnels.
export const Role = {
    ADMIN: 'ADMIN',
    CONSULTATION: 'CONSULTATION',
    STRUCTURE_ECRITURE: 'STRUCTURE_ECRITURE',
    NOTES_ECRITURE: 'NOTES_ECRITURE',
    JURY_ECRITURE: 'JURY_ECRITURE',
    PROGRAMME_ECRITURE: 'PROGRAMME_ECRITURE',
    SALLES_ECRITURE: 'SALLES_ECRITURE',
    CERTIFICATION_ECRITURE: 'CERTIFICATION_ECRITURE',
    UTILISATEURS_ECRITURE: 'UTILISATEURS_ECRITURE',
} as const;

// Les huit rôles fonctionnels que le composite ADMIN contient — miroir de
// services.RolesFonctionnels côté serveur. Posséder chacun d'eux équivaut à
// posséder ADMIN sans jamais tester son nom : c'est la condition d'accès à la
// corbeille.
export const ROLES_FONCTIONNELS: readonly string[] = [
    Role.CONSULTATION,
    Role.STRUCTURE_ECRITURE,
    Role.NOTES_ECRITURE,
    Role.JURY_ECRITURE,
    Role.PROGRAMME_ECRITURE,
    Role.SALLES_ECRITURE,
    Role.CERTIFICATION_ECRITURE,
    Role.UTILISATEURS_ECRITURE,
];

export function availableRoles(t?: TFunction<'user'>): { id: string; label: string }[] {
    const traduire = t ?? (i18n.t as unknown as TFunction<'user'>);
    return [
        { id: Role.ADMIN, label: traduire('roles.ADMIN') },
        { id: Role.CONSULTATION, label: traduire('roles.CONSULTATION') },
        { id: Role.STRUCTURE_ECRITURE, label: traduire('roles.STRUCTURE_ECRITURE') },
        { id: Role.NOTES_ECRITURE, label: traduire('roles.NOTES_ECRITURE') },
        { id: Role.JURY_ECRITURE, label: traduire('roles.JURY_ECRITURE') },
        { id: Role.PROGRAMME_ECRITURE, label: traduire('roles.PROGRAMME_ECRITURE') },
        { id: Role.SALLES_ECRITURE, label: traduire('roles.SALLES_ECRITURE') },
        { id: Role.CERTIFICATION_ECRITURE, label: traduire('roles.CERTIFICATION_ECRITURE') },
        { id: Role.UTILISATEURS_ECRITURE, label: traduire('roles.UTILISATEURS_ECRITURE') },
    ];
}