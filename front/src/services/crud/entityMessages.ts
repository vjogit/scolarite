import type { FieldValues } from 'react-hook-form';
import type { TFunction } from 'i18next';
import type { DescriptionEntite, EntiteCrud } from './def';
import { formatNombre } from '../format';
import i18n from '../../i18n/config';

/**
 * Composition des messages de succès des opérations d'écriture CRUD.
 *
 * `entityLabel` est un nom nu, sans article (« formation », « UE ») : chaque
 * entité le déclare déjà traduit, avec son genre à côté dans `entityGender`
 * (masculin par défaut si absent — jamais déduit d'un article, une langue
 * cible pouvant ne pas en poser). C'était plus subtil avant que `entityLabel`
 * ne soit traduisible : le genre se lisait dans l'article français lui-même
 * (« la » / « le »), une lecture qu'une traduction anglaise aurait cassée
 * sans le dire.
 *
 * Le genre alimente l'option `context` d'i18next (`t(clé, {context: 'f'})` →
 * `clé_f`) sur les phrases composées, posées dans le namespace `crud`. Une
 * langue qui n'accorde pas en genre — l'anglais du fichier `en/crud.json` —
 * n'a simplement pas de variante `_f` : i18next retombe sur la clé de base,
 * qui sert alors aux deux genres.
 */

type Genre = 'm' | 'f';

interface Entite {
    /** Nom nu, majuscule initiale : « Formation ». */
    nom: string;
    /**
     * Nom nu dans la casse d'origine : « période », mais « UE ». Les phrases
     * qui n'ouvrent pas sur le nom en ont besoin — abaisser la casse de `nom`
     * donnerait « aucune ue ».
     */
    nomBrut: string;
    genre: Genre;
}

function capitaliser(mot: string): string {
    return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/** Lit `entityLabel`/`entityGender`. `null` seulement si l'entité n'a pas de nom du tout. */
function analyserLibelle(datasource: DescriptionEntite): Entite | null {
    const libelle = datasource.entityLabel?.trim();
    if (!libelle) return null;
    return { nom: capitaliser(libelle), nomBrut: libelle, genre: datasource.entityGender ?? 'm' };
}

/** Le `context` i18next porté par un genre : la clé `_f` existe en français, pas en anglais. */
function contexte(genre: Genre): string | undefined {
    return genre === 'f' ? 'f' : undefined;
}

/**
 * `t()` par défaut de ces fonctions : l'instance i18next globale, toujours à
 * jour au moment de l'appel. Un appelant sous React qui affiche le résultat
 * dans un rendu mémoïsé (`useMemo`/`useCallback`) doit lui préférer le `t`
 * de son propre `useTranslation('crud')` — sa référence change avec la
 * langue, ce que l'instance globale ne fait pas, et c'est ce changement de
 * référence qui invalide le memo.
 */
export function tCrud(t?: TFunction<'crud'>): TFunction<'crud'> {
    return t ?? i18n.getFixedT(null, 'crud');
}

type CleAction = 'creation' | 'enregistrement' | 'suppression';

/**
 * « Formation « L3 Informatique » créée. », ou « « L3 Informatique » créé. »
 * quand le genre de l'entité n'est pas connu.
 */
function phraseSingulier<D extends FieldValues>(
    datasource: EntiteCrud<D>,
    nom: string,
    cle: CleAction,
    t?: TFunction<'crud'>,
): string {
    const traduire = tCrud(t);
    const entite = analyserLibelle(datasource);
    if (!entite) return traduire(`${cle}SansEntite`, { ns: 'crud', valeur: nom });
    return traduire(cle, { ns: 'crud', context: contexte(entite.genre), nom: entite.nom, valeur: nom });
}

/** Message de création, sur la donnée renvoyée par le serveur. */
export function messageCreation<D extends FieldValues>(datasource: EntiteCrud<D>, data: D, t?: TFunction<'crud'>): string {
    return phraseSingulier(datasource, datasource.getName(data), 'creation', t);
}

/** Message de modification, sur la donnée renvoyée par le serveur. */
export function messageEnregistrement<D extends FieldValues>(datasource: EntiteCrud<D>, data: D, t?: TFunction<'crud'>): string {
    return phraseSingulier(datasource, datasource.getName(data), 'enregistrement', t);
}

/**
 * « Période « Semestre 5 » supprimée. » / « 3 périodes supprimées. »
 * Pour une entité à corbeille : « … mise en corbeille. » — le message de
 * succès dit la même chose que la modale, une mise en corbeille restaurable.
 * Les noms sont ceux capturés au moment de la demande de suppression.
 */
export function messageSuppression<D extends FieldValues>(
    datasource: EntiteCrud<D>,
    noms: string[],
    t?: TFunction<'crud'>,
): string {
    const traduire = tCrud(t);
    const corbeille = datasource.suppressionEnCorbeille === true;
    const entite = analyserLibelle(datasource);

    const [premierNom = ''] = noms;
    if (noms.length === 1) {
        if (!corbeille) {
            return phraseSingulier(datasource, premierNom, 'suppression', t);
        }
        if (!entite) return traduire('miseEnCorbeilleSansEntite', { ns: 'crud', valeur: premierNom });
        return traduire('miseEnCorbeille', { ns: 'crud', context: contexte(entite.genre), nom: entite.nom, valeur: premierNom });
    }

    const nombre = formatNombre.format(noms.length);
    const pluriel = datasource.entityLabelPlural;

    if (entite && pluriel) {
        return corbeille
            ? traduire('miseEnCorbeillePluriel', { ns: 'crud', context: contexte(entite.genre), nombre, pluriel })
            : traduire('suppressionPluriel', { ns: 'crud', context: contexte(entite.genre), nombre, pluriel });
    }

    // Sans genre sûr, le mot neutre déjà employé par la modale de suppression :
    // masculin, donc accordable sans risque.
    return corbeille
        ? traduire('miseEnCorbeilleSansGenre', { ns: 'crud', nombre })
        : traduire('suppressionSansGenre', { ns: 'crud', nombre });
}

/**
 * « Aucune période enregistrée. » — le constat d'une collection réellement
 * vide, accordé comme le reste. Sans entité déterminable, la tournure neutre
 * du repli : masculin, seul accord sûr.
 *
 * Le message ne nomme pas le parent (« … pour cette option ») : le fil de
 * contexte, juste au-dessus de la liste, l'affiche déjà.
 */
export function messageListeVide(datasource: DescriptionEntite, t?: TFunction<'crud'>): string {
    const traduire = tCrud(t);
    const entite = analyserLibelle(datasource);
    if (!entite) return traduire('listeVideSansEntite', { ns: 'crud' });
    return traduire('listeVide', { ns: 'crud', context: contexte(entite.genre), nom: entite.nomBrut });
}

/**
 * « Créer une période » : le libellé de l'invite qui accompagne une liste
 * vide, et le nom accessible du bouton « Ajouter » de la barre — les deux
 * mènent au même formulaire, ils portent donc le même nom.
 */
export function libelleCreation(datasource: DescriptionEntite, t?: TFunction<'crud'>): string {
    const traduire = tCrud(t);
    const entite = analyserLibelle(datasource);
    if (!entite) return traduire('creationInviteSansEntite', { ns: 'crud' });
    return traduire('creationInvite', { ns: 'crud', context: contexte(entite.genre), nom: entite.nomBrut });
}
