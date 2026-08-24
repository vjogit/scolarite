import axios from 'axios';

/**
 * Lecture de l'enveloppe d'erreur RFC 9457 (application/problem+json).
 *
 * Le serveur émet des codes — `code` pour la famille, des motifs en
 * snake_case pour les champs et les lignes d'import — et ce module possède
 * tous les mots. Aucun texte destiné à l'écran ne vient du serveur, à deux
 * exceptions assumées : le `detail` (phrase sûre rédigée côté serveur, jamais
 * un message technique) et le `detail` PostgreSQL des conflits de créneau,
 * que le planning analyse pour retrouver les bornes.
 */

export type ApiErrorCode =
  | 'NO_INFORMATION'
  | 'VALIDATION_ERROR'
  | 'OPTIMISTIC_LOCKING_FAILURE'
  | 'MISSING_PARAM'
  | 'INVALID_PARAM'
  | 'NOT_FOUND'
  | 'BUSINESS_CONFLICT'
  | 'INVALID_BODY'
  | 'INVALID_FILE'
  | 'FILE_TOO_LARGE'
  | 'FILE_MISSING'
  | 'INVALID_FILE_EXTENSION'
  | 'INSUFFICIENT_RIGHTS'
  | 'INTERNAL_ERROR'
  | 'NO_RESULT';

export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  NO_INFORMATION:             'Une erreur est survenue.',
  VALIDATION_ERROR:           'Certains champs du formulaire sont invalides.',
  OPTIMISTIC_LOCKING_FAILURE: 'Ces données ont été modifiées par un autre utilisateur. Veuillez recharger la page et réessayer.',
  MISSING_PARAM:              'Un paramètre obligatoire est manquant.',
  INVALID_PARAM:              'Un paramètre fourni est invalide.',
  NOT_FOUND:                  'La ressource demandée est introuvable.',
  BUSINESS_CONFLICT:          'Un conflit a été détecté (créneau ou ressource déjà réservé·e).',
  INVALID_BODY:               'Le format de la requête est invalide.',
  INVALID_FILE:               'Le fichier fourni est illisible ou son format est incorrect.',
  FILE_TOO_LARGE:             'Le fichier dépasse la taille maximale autorisée.',
  FILE_MISSING:               "Aucun fichier n'a été fourni.",
  INVALID_FILE_EXTENSION:     "L'extension du fichier n'est pas prise en charge.",
  INSUFFICIENT_RIGHTS:        "Vous ne disposez pas des droits nécessaires pour effectuer cette action.",
  INTERNAL_ERROR:             'Une erreur interne est survenue. Veuillez réessayer ultérieurement.',
  NO_RESULT:                  'Aucun résultat trouvé.',
};

const KNOWN_CODES = new Set<string>([
  'NO_INFORMATION', 'VALIDATION_ERROR', 'OPTIMISTIC_LOCKING_FAILURE',
  'MISSING_PARAM', 'INVALID_PARAM', 'NOT_FOUND', 'BUSINESS_CONFLICT',
  'INVALID_BODY', 'INVALID_FILE', 'FILE_TOO_LARGE', 'FILE_MISSING',
  'INVALID_FILE_EXTENSION', 'INSUFFICIENT_RIGHTS', 'INTERNAL_ERROR', 'NO_RESULT',
]);

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

// ─── Motifs : les codes que le serveur émet, les mots que le front possède ───

/** Erreur de champ telle que l'enveloppe la transporte : un motif, pas une phrase. */
interface ErreurChampBrute {
  motif: string;
  /** Detail PostgreSQL des exclusions 23P01 — le planning y lit les bornes. */
  detail?: string;
  /** Borne du barème, seul paramètre d'un motif (note_hors_bareme). */
  max?: number;
}

/** Une ligne fautive d'un fichier d'import, en données. */
export interface LigneRefusee {
  ligne?: number;
  champ?: string;
  motif: string;
  valeur?: string;
  eleve?: string;
  remarque?: string;
}

/** L'extension `lignes` d'un refus d'import, avec son barème le cas échéant. */
export interface LignesRefusees {
  lignes: LigneRefusee[];
  bareme?: number;
}

const MOTIF_CHAMP_MESSAGES: Record<string, string> = {
  champ_obligatoire:    'Ce champ est obligatoire',
  valeur_deja_utilisee: 'Cette valeur est déjà utilisée',
  valeur_negative:      'La valeur doit être positive',
  note_max_absolu:      'La note dépasse la valeur maximale autorisée',
  fin_avant_debut:      'La date de fin doit être après la date de début',
  echelle_longueur:     "L'échelle doit contenir 5 valeurs",
  echelle_decroissante: "L'échelle doit être décroissante",
  echelle_hors_bareme:  "Les seuils de l'échelle ne peuvent pas dépasser le barème",
};

/** Le sujet de « … n'existe pas » / « … déjà réservé » selon le champ visé. */
const LIBELLE_REFERENCE: Record<string, string> = {
  controle_id:           'Le contrôle',
  user_id:               "L'élève",
  option_id:             "L'option",
  periode_id:            'La période',
  matiere_id:            'La matière',
  unite_enseignement_id: "L'UE",
  formation_id:          'La formation',
  promotion_id:          'La promotion',
};

const LIBELLE_CRENEAU: Record<string, string> = {
  salles:       'Une ou plusieurs salles sont déjà réservées sur ce créneau',
  intervenants: 'Un ou plusieurs intervenants sont déjà occupés sur ce créneau',
  groupes:      'Un ou plusieurs groupes sont déjà planifiés sur ce créneau',
};

/** Formate un nombre sans décimale superflue (« 20 », pas « 20.00 »). */
function formatBorne(valeur: number): string {
  return String(valeur);
}

/** Le message d'une erreur de champ, composé depuis son motif. */
function messageChamp(champ: string, erreur: ErreurChampBrute): string {
  switch (erreur.motif) {
    case 'note_hors_bareme':
      return erreur.max != null
        ? `La note doit être comprise entre 0 et ${formatBorne(erreur.max)}`
        : 'La note dépasse le barème';
    case 'reference_inconnue':
      return `${LIBELLE_REFERENCE[champ] ?? 'La ressource référencée'} n'existe pas`;
    case 'creneau_deja_reserve':
      return LIBELLE_CRENEAU[champ] ?? 'Ce créneau est déjà réservé';
    default:
      return MOTIF_CHAMP_MESSAGES[erreur.motif] ?? ERROR_MESSAGES.VALIDATION_ERROR;
  }
}

/** Le message d'une ligne d'import refusée, composé depuis son motif. */
export function messageLigneRefusee(l: LigneRefusee, bareme?: number): string {
  switch (l.motif) {
    case 'cellule_invalide':
      return `« ${l.valeur ?? ''} » n'est pas une note. Laissez la cellule vide s'il n'y a pas de note.`;
    case 'note_hors_bareme':
      return bareme != null
        ? `La note ${l.valeur ?? ''} est hors barème (entre 0 et ${formatBorne(bareme)}).`
        : `La note ${l.valeur ?? ''} est hors barème.`;
    case 'eleve_inconnu':
      return "L'identifiant ne correspond à aucun élève.";
    case 'note_sur_eleve_non_evalue': {
      // Forme inclusive courte : le genre n'est pas en base, et le deviner
      // sur un prénom serait se tromper un jour.
      const remarque = l.remarque ? ` (${l.remarque})` : '';
      return `${l.eleve ?? 'Cet élève'} est déclaré·e non évalué·e${remarque}, mais la fiche porte la note ${l.valeur ?? ''}.`;
    }
    case 'email_manquant':
      return "L'email est manquant.";
    case 'nature_invalide':
      return `Nature inconnue : « ${l.valeur ?? ''} ». Attendu : ELEVE ou AGENT.`;
    case 'role_inconnu':
      return `Rôle non attribuable : « ${l.valeur ?? ''} ».`;
    case 'role_sur_eleve':
      return 'Un élève ne porte pas de rôle applicatif.';
    case 'structure_inattendue':
      return `Structure inattendue : « ${l.valeur ?? ''} » là où un semestre était attendu.`;
    default:
      return ERROR_MESSAGES.INVALID_FILE;
  }
}

// ─── Extraction depuis l'enveloppe ───────────────────────────────────────────

// Extrait le code depuis un corps problem+json (forme { code, ... }).
function codeFromPayload(payload: unknown): ApiErrorCode | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const code = (payload as Record<string, unknown>).code;
  return isApiErrorCode(code) ? code : null;
}

// L'extension `errors` au niveau racine : { champ: { motif, detail?, max? } }.
function erreursBrutesFromPayload(payload: unknown): Record<string, ErreurChampBrute> {
  if (typeof payload !== 'object' || payload === null) return {};
  const brutes = (payload as Record<string, unknown>).errors;
  if (typeof brutes !== 'object' || brutes === null) return {};
  const erreurs: Record<string, ErreurChampBrute> = {};
  for (const [champ, valeur] of Object.entries(brutes as Record<string, unknown>)) {
    if (typeof valeur !== 'object' || valeur === null) continue;
    const v = valeur as Record<string, unknown>;
    if (typeof v.motif !== 'string') continue;
    erreurs[champ] = {
      motif: v.motif,
      detail: typeof v.detail === 'string' ? v.detail : undefined,
      max: typeof v.max === 'number' ? v.max : undefined,
    };
  }
  return erreurs;
}

// Extrait errors quand le code est VALIDATION_ERROR, messages composés.
function fieldErrorsFromPayload(payload: unknown): Record<string, string> | null {
  if (codeFromPayload(payload) !== 'VALIDATION_ERROR') return null;
  const brutes = erreursBrutesFromPayload(payload);
  const errors: Record<string, string> = {};
  for (const [champ, erreur] of Object.entries(brutes)) {
    errors[champ] = messageChamp(champ, erreur);
  }
  return errors;
}

// Duck-type pour les instances ApiError déjà wrappées (crud/def.ts).
// On évite l'import circulaire en ne testant que la forme structurelle.
function isWrappedApiError(err: unknown): err is { payload?: unknown } {
  return typeof err === 'object' && err !== null && 'payload' in err;
}

/** Le corps problem+json d'une erreur, quelle que soit sa forme d'emballage. */
function payloadFor(err: unknown): unknown {
  if (axios.isAxiosError(err)) return err.response?.data;
  if (isWrappedApiError(err)) return err.payload;
  return null;
}

// Code d'erreur porté par la réponse, quand elle en porte un.
//
// `messageForError` suffit à afficher une erreur ; certains appelants doivent
// en plus la router — la grille de saisie traite un conflit de version
// autrement qu'un échec réseau, sur la seule ligne concernée.
export function codeFor(err: unknown): ApiErrorCode | null {
  return codeFromPayload(payloadFor(err));
}

/**
 * Identifiant d'incident d'un 500, extrait de `instance` (/incidents/xxxx).
 * C'est lui qui rend un signalement d'utilisateur retrouvable dans les logs.
 */
export function incidentFor(err: unknown): string | null {
  const payload = payloadFor(err);
  if (typeof payload !== 'object' || payload === null) return null;
  const instance = (payload as Record<string, unknown>).instance;
  if (typeof instance !== 'string') return null;
  const id = instance.split('/').pop();
  if (!id) return null;
  return id;
}

export function messageForError(err: unknown): string {
  const code = codeFor(err);
  const message = code ? ERROR_MESSAGES[code] : 'Une erreur est survenue.';
  const incident = incidentFor(err);
  return incident ? `${message} (code incident : ${incident})` : message;
}

// Message précis d'un conflit métier : le serveur renvoie l'extension `reason`
// et un `detail` déjà rédigé (ex. période avec jury délibéré). Le libellé
// générique de BUSINESS_CONFLICT parle de créneaux, il serait trompeur ici.
function blockingMessageFromPayload(payload: unknown): string | null {
  if (codeFromPayload(payload) !== 'BUSINESS_CONFLICT') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.reason !== 'string') return null;
  const detail = p.detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : null;
}

export function blockingMessageFor(err: unknown): string | null {
  return blockingMessageFromPayload(payloadFor(err));
}

// `detail` rédigé par le serveur pour un fichier refusé (phrase sûre : contrôle
// attendu vs fourni, extension, feuille absente…). Volontairement restreint à
// ce code — les autres familles gardent leurs libellés génériques.
export function fileMessageFor(err: unknown): string | null {
  const payload = payloadFor(err);
  if (codeFromPayload(payload) !== 'INVALID_FILE') return null;
  const detail = (payload as Record<string, unknown>).detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : null;
}

/**
 * Les lignes fautives d'un import refusé, si la réponse en porte.
 * C'est l'extension `lignes` du refus : le tableau à l'écran vient d'ici.
 */
export function lignesFor(err: unknown): LignesRefusees | null {
  const payload = payloadFor(err);
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.lignes)) return null;
  const lignes: LigneRefusee[] = [];
  for (const brute of p.lignes as unknown[]) {
    if (typeof brute !== 'object' || brute === null) continue;
    const v = brute as Record<string, unknown>;
    if (typeof v.motif !== 'string') continue;
    lignes.push({
      motif: v.motif,
      ligne: typeof v.ligne === 'number' ? v.ligne : undefined,
      champ: typeof v.champ === 'string' ? v.champ : undefined,
      valeur: typeof v.valeur === 'string' ? v.valeur : undefined,
      eleve: typeof v.eleve === 'string' ? v.eleve : undefined,
      remarque: typeof v.remarque === 'string' ? v.remarque : undefined,
    });
  }
  if (lignes.length === 0) return null;
  return {
    lignes,
    bareme: typeof p.bareme === 'number' ? p.bareme : undefined,
  };
}

/** Erreur de champ avec son message composé et le détail technique éventuel. */
export interface ErreurChamp {
  message: string;
  detail?: string;
}

// Les erreurs de champ sans les aplatir. `fieldErrorsFor` n'en garde que le
// message, ce qui suffit à un formulaire ; le planning a besoin du `detail`
// PostgreSQL, seul endroit où figurent les bornes du créneau déjà réservé.
function conflitsDetaillesFromPayload(payload: unknown): Record<string, ErreurChamp> {
  const brutes = erreursBrutesFromPayload(payload);
  const erreurs: Record<string, ErreurChamp> = {};
  for (const [champ, erreur] of Object.entries(brutes)) {
    erreurs[champ] = {
      message: messageChamp(champ, erreur),
      detail: erreur.detail,
    };
  }
  return erreurs;
}

/** Les conflits de champ d'une erreur, quelle que soit sa forme. */
export function conflitsDetaillesFor(err: unknown): Record<string, ErreurChamp> {
  return conflitsDetaillesFromPayload(payloadFor(err));
}

export function fieldErrorsFor(err: unknown): Record<string, string> | null {
  return fieldErrorsFromPayload(payloadFor(err));
}
