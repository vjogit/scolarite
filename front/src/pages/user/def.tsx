
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

export const AVAILABLE_ROLES = [
    { id: Role.ADMIN, label: 'Administrateur' },
    { id: Role.CONSULTATION, label: 'Consultation' },
    { id: Role.STRUCTURE_ECRITURE, label: 'Structure (écriture)' },
    { id: Role.NOTES_ECRITURE, label: 'Notes (écriture)' },
    { id: Role.JURY_ECRITURE, label: 'Jury (écriture)' },
    { id: Role.PROGRAMME_ECRITURE, label: 'Programme (écriture)' },
    { id: Role.SALLES_ECRITURE, label: 'Salles (écriture)' },
    { id: Role.CERTIFICATION_ECRITURE, label: 'Certifications (écriture)' },
    { id: Role.UTILISATEURS_ECRITURE, label: 'Utilisateurs (écriture)' },
];