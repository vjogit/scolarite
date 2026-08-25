import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { z } from 'zod';
import errorsFr from './locales/fr/errors.json';
import crudFr from './locales/fr/crud.json';
import validationFr from './locales/fr/validation.json';
import noteFr from './locales/fr/note.json';
import corbeilleFr from './locales/fr/corbeille.json';
import registreFr from './locales/fr/registre.json';
import salleFr from './locales/fr/salle.json';
import catalogFr from './locales/fr/catalog.json';
import certificationFr from './locales/fr/certification.json';
import programmeFr from './locales/fr/programme.json';
import juryFr from './locales/fr/jury.json';
import userFr from './locales/fr/user.json';
import structureFr from './locales/fr/structure.json';
import appFr from './locales/fr/app.json';
import errorsEn from './locales/en/errors.json';
import crudEn from './locales/en/crud.json';
import validationEn from './locales/en/validation.json';
import noteEn from './locales/en/note.json';
import corbeilleEn from './locales/en/corbeille.json';
import registreEn from './locales/en/registre.json';
import salleEn from './locales/en/salle.json';
import catalogEn from './locales/en/catalog.json';
import certificationEn from './locales/en/certification.json';
import programmeEn from './locales/en/programme.json';
import juryEn from './locales/en/jury.json';
import userEn from './locales/en/user.json';
import structureEn from './locales/en/structure.json';
import appEn from './locales/en/app.json';

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
      fr: { errors: errorsFr, crud: crudFr, validation: validationFr, note: noteFr, corbeille: corbeilleFr, registre: registreFr, salle: salleFr, catalog: catalogFr, certification: certificationFr, programme: programmeFr, jury: juryFr, user: userFr, structure: structureFr, app: appFr },
      en: { errors: errorsEn, crud: crudEn, validation: validationEn, note: noteEn, corbeille: corbeilleEn, registre: registreEn, salle: salleEn, catalog: catalogEn, certification: certificationEn, programme: programmeEn, jury: juryEn, user: userEn, structure: structureEn, app: appEn },
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    defaultNS,
    ns: ['errors', 'crud', 'validation', 'note', 'corbeille', 'registre', 'salle', 'catalog', 'certification', 'programme', 'jury', 'user', 'structure', 'app'],
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
