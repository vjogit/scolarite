import axios from 'axios';
import i18n from '../i18n/config';

/**
 * Lecture de l'enveloppe d'erreur RFC 9457 (application/problem+json).
 *
 * Le serveur émet des codes — `code` pour la famille, des motifs en
 * snake_case pour les champs et les lignes d'import — et ce module possède
 * tous les mots (namespace i18next `errors`). Aucun texte destiné à l'écran
 * ne vient du serveur, à deux exceptions assumées : le `detail` (phrase sûre
 * rédigée côté serveur, jamais un message technique) et le `detail`
 * PostgreSQL des conflits de créneau, que le planning analyse pour retrouver
 * les bornes.
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
  | 'NO_RESULT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED';

/** Le message générique d'un code d'erreur, dans la langue active. */
export function errorMessage(code: ApiErrorCode): string {
  return i18n.t(`codes.${code}`, { ns: 'errors' });
}

const KNOWN_CODES = new Set<string>([
  'NO_INFORMATION', 'VALIDATION_ERROR', 'OPTIMISTIC_LOCKING_FAILURE',
  'MISSING_PARAM', 'INVALID_PARAM', 'NOT_FOUND', 'BUSINESS_CONFLICT',
  'INVALID_BODY', 'INVALID_FILE', 'FILE_TOO_LARGE', 'FILE_MISSING',
  'INVALID_FILE_EXTENSION', 'INSUFFICIENT_RIGHTS', 'INTERNAL_ERROR', 'NO_RESULT',
  'PAYLOAD_TOO_LARGE', 'RATE_LIMITED',
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

/**
 * `t()` non typé, pour les clés indexées par un identifiant serveur (nom de
 * champ, motif) — pas énumérable statiquement, donc hors de l'union de clés
 * que le typage strict des ressources i18next dérive de fr/errors.json.
 */
function tDyn(cle: string, options?: Record<string, unknown>): string {
  return (i18n.t as (key: string, options?: Record<string, unknown>) => string)(cle, { ns: 'errors', ...options });
}

/** Le sujet de « … n'existe pas » selon le champ visé, si le namespace le connaît. */
function libelleReference(champ: string): string {
  const cle = `reference.${champ}`;
  return i18n.exists(cle, { ns: 'errors' }) ? tDyn(cle) : i18n.t('referenceGenerique', { ns: 'errors' });
}

/** Le sujet de « … déjà réservé » selon le champ visé, si le namespace le connaît. */
function libelleCreneau(champ: string): string {
  const cle = `creneau.${champ}`;
  return i18n.exists(cle, { ns: 'errors' }) ? tDyn(cle) : i18n.t('creneauDejaReserveGenerique', { ns: 'errors' });
}

/** Formate un nombre sans décimale superflue (« 20 », pas « 20.00 »). */
function formatBorne(valeur: number): string {
  return String(valeur);
}

/** Le message d'une erreur de champ, composé depuis son motif. */
function messageChamp(champ: string, erreur: ErreurChampBrute): string {
  switch (erreur.motif) {
    case 'note_hors_bareme':
      return erreur.max != null
        ? i18n.t('noteHorsBaremeAvecMax', { ns: 'errors', max: formatBorne(erreur.max) })
        : i18n.t('noteDepasseBareme', { ns: 'errors' });
    case 'reference_inconnue':
      return i18n.t('referenceInconnue', { ns: 'errors', reference: libelleReference(champ) });
    case 'creneau_deja_reserve':
      return libelleCreneau(champ);
    default: {
      const cle = `motifChamp.${erreur.motif}`;
      return i18n.exists(cle, { ns: 'errors' }) ? tDyn(cle) : errorMessage('VALIDATION_ERROR');
    }
  }
}

/** Le message d'une ligne d'import refusée, composé depuis son motif. */
export function messageLigneRefusee(l: LigneRefusee, bareme?: number): string {
  switch (l.motif) {
    case 'cellule_invalide':
      return i18n.t('ligneRefusee.cellule_invalide', { ns: 'errors', valeur: l.valeur ?? '' });
    case 'note_hors_bareme':
      return bareme != null
        ? i18n.t('ligneRefusee.note_hors_bareme_avec_bareme', { ns: 'errors', valeur: l.valeur ?? '', bareme: formatBorne(bareme) })
        : i18n.t('ligneRefusee.note_hors_bareme_sans_bareme', { ns: 'errors', valeur: l.valeur ?? '' });
    case 'eleve_inconnu':
      return i18n.t('ligneRefusee.eleve_inconnu', { ns: 'errors' });
    case 'note_sur_eleve_non_evalue': {
      // Forme inclusive courte : le genre n'est pas en base, et le deviner
      // sur un prénom serait se tromper un jour.
      const remarque = l.remarque ? ` (${l.remarque})` : '';
      const eleve = l.eleve ?? i18n.t('ligneRefusee.eleveParDefaut', { ns: 'errors' });
      return i18n.t('ligneRefusee.note_sur_eleve_non_evalue', { ns: 'errors', eleve, remarque, valeur: l.valeur ?? '' });
    }
    case 'email_manquant':
      return i18n.t('ligneRefusee.email_manquant', { ns: 'errors' });
    case 'nature_invalide':
      return i18n.t('ligneRefusee.nature_invalide', { ns: 'errors', valeur: l.valeur ?? '' });
    case 'role_inconnu':
      return i18n.t('ligneRefusee.role_inconnu', { ns: 'errors', valeur: l.valeur ?? '' });
    case 'role_sur_eleve':
      return i18n.t('ligneRefusee.role_sur_eleve', { ns: 'errors' });
    case 'structure_inattendue':
      return i18n.t('ligneRefusee.structure_inattendue', { ns: 'errors', valeur: l.valeur ?? '' });
    default:
      return errorMessage('INVALID_FILE');
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
  const message = code ? errorMessage(code) : errorMessage('NO_INFORMATION');
  const incident = incidentFor(err);
  return incident ? i18n.t('avecIncident', { ns: 'errors', message, incident }) : message;
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
