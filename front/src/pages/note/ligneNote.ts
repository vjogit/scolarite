/**
 * Modèle d'une ligne de la grille de saisie des notes.
 *
 * Le renversement par rapport aux autres écrans de notes tient tout entier
 * ici : une ligne est un élève de l'effectif, pas une note. Elle porte donc
 * une note éventuelle — `noteId` nul tant qu'aucune n'existe — et l'état de
 * son propre enregistrement, chaque ligne étant écrite séparément.
 */

import type { createNoteField } from './noteField';
import i18n from '../../i18n/config';

/** Schéma de validation du barème, construit une fois par `createNoteField`. */
export type ChampNote = ReturnType<typeof createNoteField>;

/** Une ligne telle que l'endpoint `/note/grille` la rend. */
export interface LigneGrilleServeur {
    user_id: number;
    lastname: string;
    firstname: string;
    note_id: number | null;
    note_version: number | null;
    note: number | null;
    not_evaluated: boolean | null;
    is_validated: boolean | null;
    remarque: string | null;
}

/** Note renvoyée par les endpoints d'écriture unitaires. */
export interface NoteEnregistree {
    id: number;
    version: number;
    note: number | null;
    remarque: string | null;
    is_validated: boolean;
    not_evaluated: boolean;
    user_id: number;
    controle_id: number;
}

/**
 * Statut d'enregistrement d'une ligne, rendu par l'indicateur de droite.
 *
 * `erreur` et `conflit` sont distincts parce qu'ils appellent des gestes
 * différents : la première se relance telle quelle, la seconde impose de
 * relire la ligne avant d'écraser le travail d'un autre.
 */
export type StatutLigne =
    | 'inchange'
    | 'modifie'
    | 'en-attente'
    | 'enregistre'
    | 'erreur'
    | 'conflit';

/**
 * Valeurs saisissables d'une ligne.
 *
 * La note est une chaîne et non un nombre : « 15,5 » doit survivre à la frappe.
 * Un champ `type="number"` rendrait une chaîne vide dès que le navigateur juge
 * la saisie intermédiaire invalide, et la valeur serait perdue en silence.
 */
export interface SaisieLigne {
    note: string;
    notEvaluated: boolean;
    isValidated: boolean;
    remarque: string;
}

export interface LigneGrille {
    userId: number;
    nom: string;
    prenom: string;
    saisie: SaisieLigne;
    /** Dernier état connu du serveur : ce à quoi `saisie` est comparée. */
    enregistre: SaisieLigne;
    statut: StatutLigne;
    /** Message affiché sous le champ note : barème, réseau ou conflit. */
    message: string | null;
}

/**
 * L'élève d'une ligne, et rien d'autre : ce dont une action de ligne a besoin.
 *
 * Un alias de type et non une interface, à dessein — c'est ce qui le rend
 * assignable à `FieldValues`, donc utilisable avec `ActionLigne`, sans ajouter
 * la moindre signature d'index : TypeScript en infère une pour les alias,
 * jamais pour les interfaces. Déclarer l'action sur cette forme réduite plutôt
 * que sur `LigneGrille` dit aussi ce qu'elle lit — l'identité de l'élève, pas
 * l'état de sa saisie.
 */
// `consistent-type-definitions` voudrait une interface. C'est précisément ce
// qu'il ne faut pas ici : une interface n'obtient pas de signature d'index
// implicite, et ne satisfait donc pas `FieldValues`. L'alternative serait un
// transtypage à chaque appel d'action, ou un `any` — la règle de style coûterait
// plus qu'elle ne rapporte.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type LigneEleve = {
    userId: number;
    nom: string;
    prenom: string;
};

/** Identifiants d'écriture d'une ligne, tenus à part de l'état de rendu. */
export interface IdentiteNote {
    noteId: number | null;
    version: number | null;
}

/**
 * Rendu d'une note en saisie. La virgule est le séparateur décimal attendu à
 * l'écran ; `analyserNote` accepte les deux en entrée.
 */
export function formaterNote(valeur: number | null): string {
    return valeur == null ? '' : String(valeur).replace('.', ',');
}

/**
 * Une ligne que rien n'a encore renseignée. C'est l'état d'un élève de
 * l'effectif sans note, et celui où retombe une ligne dont la note vient d'être
 * supprimée : les deux se ressemblent parce qu'ils disent la même chose.
 */
export const SAISIE_VIERGE: SaisieLigne = {
    note: '',
    notEvaluated: false,
    isValidated: false,
    remarque: '',
};

export function saisieDepuisServeur(ligne: LigneGrilleServeur): SaisieLigne {
    return {
        note: formaterNote(ligne.note),
        notEvaluated: ligne.not_evaluated ?? false,
        isValidated: ligne.is_validated ?? false,
        remarque: ligne.remarque ?? '',
    };
}

export function ligneDepuisServeur(ligne: LigneGrilleServeur): LigneGrille {
    const saisie = saisieDepuisServeur(ligne);
    return {
        userId: ligne.user_id,
        nom: ligne.lastname,
        prenom: ligne.firstname,
        saisie,
        enregistre: saisie,
        statut: 'inchange',
        message: null,
    };
}

export function identiteDepuisServeur(ligne: LigneGrilleServeur): IdentiteNote {
    return { noteId: ligne.note_id, version: ligne.note_version };
}

/**
 * Empreinte d'une saisie, utilisée pour deux comparaisons : « la ligne a-t-elle
 * changé depuis le serveur » et « ai-je déjà envoyé exactement ceci ». La
 * seconde est ce qui empêche le `blur` consécutif à une validation par
 * « Entrée » de réémettre la même écriture.
 */
export function empreinte(saisie: SaisieLigne): string {
    return [
        saisie.note.trim().replace(',', '.'),
        saisie.notEvaluated ? '1' : '0',
        saisie.isValidated ? '1' : '0',
        saisie.remarque.trim(),
    ].join(' ');
}

export type ResultatNote =
    | { ok: true; valeur: number | null }
    | { ok: false; message: string };

/**
 * Analyse une note saisie contre le barème du contrôle.
 *
 * La validation du barème n'est pas réécrite : elle vient de `createNoteField`,
 * partagé avec les quatre autres écrans de notes. Seuls la virgule décimale et
 * le cas « champ vide » sont traités ici, deux situations qu'un formulaire à
 * champ numérique n'avait pas à connaître.
 */
export function analyserNote(texte: string, champ: ChampNote): ResultatNote {
    const brut = texte.trim().replace(',', '.');
    if (brut === '') return { ok: true, valeur: null };

    const valeur = Number(brut);
    if (!Number.isFinite(valeur)) {
        return { ok: false, message: i18n.t('ligneNote.valeurNumeriqueAttendue', { ns: 'note' }) };
    }

    const verdict = champ.safeParse(valeur);
    if (!verdict.success) {
        return { ok: false, message: verdict.error.issues[0]?.message ?? i18n.t('ligneNote.noteInvalide', { ns: 'note' }) };
    }
    return { ok: true, valeur };
}

/**
 * Une ligne est pourvue quand elle porte une note valide ou qu'elle est
 * déclarée non évaluée. C'est la définition du compteur de progression, et
 * aussi la condition d'un enregistrement : une note vide sans « non évalué »
 * n'est pas un état que la grille sait écrire.
 */
export function estPourvue(saisie: SaisieLigne, champ: ChampNote): boolean {
    if (saisie.notEvaluated) return true;
    const analyse = analyserNote(saisie.note, champ);
    return analyse.ok && analyse.valeur != null;
}
