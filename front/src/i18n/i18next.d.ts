import 'i18next';
import type errors from './locales/fr/errors.json';
import type crud from './locales/fr/crud.json';
import type validation from './locales/fr/validation.json';
import type note from './locales/fr/note.json';
import type corbeille from './locales/fr/corbeille.json';
import type registre from './locales/fr/registre.json';
import type salle from './locales/fr/salle.json';
import type catalog from './locales/fr/catalog.json';
import type certification from './locales/fr/certification.json';
import type programme from './locales/fr/programme.json';
import type jury from './locales/fr/jury.json';
import type user from './locales/fr/user.json';
import type structure from './locales/fr/structure.json';
import type app from './locales/fr/app.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'errors';
    resources: {
      errors: typeof errors;
      crud: typeof crud;
      validation: typeof validation;
      note: typeof note;
      corbeille: typeof corbeille;
      registre: typeof registre;
      salle: typeof salle;
      catalog: typeof catalog;
      certification: typeof certification;
      programme: typeof programme;
      jury: typeof jury;
      user: typeof user;
      structure: typeof structure;
      app: typeof app;
    };
  }
}
