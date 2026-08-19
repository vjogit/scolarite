import axios from 'axios';

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

export interface ApiError {
  code: ApiErrorCode;
  message?: string;
  details?: unknown;
}

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

// Extrait le code depuis un objet payload (forme { code, details, ... }).
function codeFromPayload(payload: unknown): ApiErrorCode | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const code = (payload as Record<string, unknown>)['code'];
  return isApiErrorCode(code) ? code : null;
}

// Extrait details.errors depuis un payload quand le code est VALIDATION_ERROR.
function fieldErrorsFromPayload(payload: unknown): Record<string, string> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p['code'] !== 'VALIDATION_ERROR') return null;
  const details = p['details'];
  if (typeof details !== 'object' || details === null) return null;
  const rawErrors = (details as Record<string, unknown>)['errors'];
  if (typeof rawErrors !== 'object' || rawErrors === null) return null;
  const errors: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawErrors as Record<string, unknown>)) {
    if (typeof val === 'string') {
      errors[key] = val;
    } else if (typeof val === 'object' && val !== null && 'message' in val) {
      errors[key] = String((val as Record<string, unknown>)['message']);
    }
  }
  return errors;
}

// Duck-type pour les instances ApiError déjà wrappées (crud/def.ts).
// On évite l'import circulaire en ne testant que la forme structurelle.
function isWrappedApiError(err: unknown): err is { payload?: unknown } {
  return typeof err === 'object' && err !== null && 'payload' in err;
}

export function messageForError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const code = codeFromPayload(err.response?.data);
    if (code) return ERROR_MESSAGES[code];
  } else if (isWrappedApiError(err)) {
    const code = codeFromPayload(err.payload);
    if (code) return ERROR_MESSAGES[code];
  }
  return 'Une erreur est survenue.';
}

// Message précis d'un conflit métier : le serveur renvoie details.reason avec
// un message déjà rédigé (ex. période avec jury délibéré). Le libellé générique
// de BUSINESS_CONFLICT parle de créneaux, il serait trompeur dans ce cas.
function blockingMessageFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p['code'] !== 'BUSINESS_CONFLICT') return null;
  const details = p['details'];
  if (typeof details !== 'object' || details === null) return null;
  if (typeof (details as Record<string, unknown>)['reason'] !== 'string') return null;
  const message = p['message'];
  return typeof message === 'string' && message.length > 0 ? message : null;
}

export function blockingMessageFor(err: unknown): string | null {
  if (axios.isAxiosError(err)) {
    return blockingMessageFromPayload(err.response?.data);
  }
  if (isWrappedApiError(err)) {
    return blockingMessageFromPayload(err.payload);
  }
  return null;
}

export function fieldErrorsFor(err: unknown): Record<string, string> | null {
  if (axios.isAxiosError(err)) {
    return fieldErrorsFromPayload(err.response?.data);
  }
  if (isWrappedApiError(err)) {
    return fieldErrorsFromPayload(err.payload);
  }
  return null;
}
