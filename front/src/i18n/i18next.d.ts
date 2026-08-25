import 'i18next';
import type errors from './locales/fr/errors.json';
import type crud from './locales/fr/crud.json';
import type validation from './locales/fr/validation.json';
import type note from './locales/fr/note.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'errors';
    resources: {
      errors: typeof errors;
      crud: typeof crud;
      validation: typeof validation;
      note: typeof note;
    };
  }
}
