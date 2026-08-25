import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { z } from 'zod';
import errorsFr from './locales/fr/errors.json';
import crudFr from './locales/fr/crud.json';
import validationFr from './locales/fr/validation.json';
import noteFr from './locales/fr/note.json';
import errorsEn from './locales/en/errors.json';
import crudEn from './locales/en/crud.json';
import validationEn from './locales/en/validation.json';
import noteEn from './locales/en/note.json';

/**
 * Ressources posées en dur (pas de backend HTTP) : l'appli est petite, le
 * chargement paresseux par namespace n'apporterait rien avant qu'elle
 * grossisse vraiment. Un namespace par workflow (`note`, `structure`… à
 * suivre) : la migration des libellés inline des pages avance workflow par
 * workflow.
 */
export const defaultNS = 'errors';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { errors: errorsFr, crud: crudFr, validation: validationFr, note: noteFr },
      en: { errors: errorsEn, crud: crudEn, validation: validationEn, note: noteEn },
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    defaultNS,
    ns: ['errors', 'crud', 'validation', 'note'],
    interpolation: {
      escapeValue: false, // React échappe déjà : pas besoin d'un second passage.
    },
  });

/**
 * Les messages zod que personne ne surcharge (mauvais type, champ manquant
 * sans message dédié…) suivaient jusqu'ici le défaut de la bibliothèque —
 * l'anglais, silencieusement, quelle que soit la langue active. `z.config`
 * pose la table de messages globale ; on la refait suivre `i18n.language` à
 * chaque changement, y compris le premier posé par le détecteur de langue.
 */
function langueZod(langue: string): ReturnType<typeof z.locales.fr> {
  return langue.startsWith('en') ? z.locales.en() : z.locales.fr();
}
z.config(langueZod(i18n.language));
i18n.on('languageChanged', (langue) => { z.config(langueZod(langue)); });

export default i18n;
