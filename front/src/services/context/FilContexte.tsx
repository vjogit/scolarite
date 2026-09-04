/**
 * Le fil de contexte : l'unique navigation contextuelle des workflows.
 *
 * Il réunit ce que le fil d'Ariane et le rappel de contexte faisaient chacun à
 * moitié : tous les niveaux que porte l'URL, du plus général au plus profond,
 * chaque niveau ouvrant un menu qui offre à la fois ses frères et l'accès à sa
 * liste. Les écrans terminaux (`toeic`, `jury`, `note`…) terminent le fil en
 * libellé inerte.
 *
 * Tout est dérivé du `pathname`, segment par segment : les paires
 * `segment/identifiant` donnent les niveaux, les segments seuls donnent les
 * listes et les écrans terminaux. Aucun état ne double l'URL.
 *
 * Deux sémantiques de bascule cohabitent, héritées telles quelles du lot 2 :
 *
 * - un niveau partagé passe par `construireCheminWorkflow` — niveaux
 *   inférieurs abandonnés, écran terminal du workflow retrouvé ;
 * - un niveau profond remplace son identifiant dans l'URL et retombe sur le
 *   segment enfant que l'URL portait — même raisonnement, appliqué à la partie
 *   de l'URL que le contexte partagé ne décrit pas.
 */

import { Fragment, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { useContexteHierarchie, type NiveauResolu } from './contexte';
import { depotFreres } from './freres';
import { estNiveau, libelleNiveau, type ContexteHierarchique, type Niveau } from './niveaux';
import { construireCheminWorkflow, ecranTerminalDuChemin, remplacerNiveau } from './navigation';
import { libelleSegment, prolongementsDuWorkflow, type ResolveurNom, type SegmentProlonge } from './prolongements';
import { useNomResolu } from './resolution';
import { SelecteurNiveau } from './SelecteurNiveau';
import type { DescripteurWorkflow } from './workflows';

/** Un segment d'URL est un identifiant s'il n'est fait que de chiffres. */
function estIdentifiant(segment: string): boolean {
    return /^\d+$/.test(segment);
}

/** Segments de mode CRUD : jamais affichés, comme dans l'ancien fil. */
const SEGMENTS_CRUD = new Set(['edit', 'new']);

interface ElementNiveau {
    readonly genre: 'niveau';
    readonly niveau: Niveau;
    /** `null` : niveau proposé mais pas encore choisi — sa liste est à l'écran. */
    readonly identifiant: string | null;
    readonly cheminListe: string;
}

interface ElementProfond {
    readonly genre: 'profond';
    readonly segment: SegmentProlonge;
    readonly resoudre: ResolveurNom;
    readonly identifiant: string;
    /** L'identifiant qui précède dans l'URL : celui qui filtre les frères. */
    readonly identifiantParent: string | null;
    readonly cheminListe: string;
    /** Segment enfant à conserver lors d'une bascule vers un frère. */
    readonly segmentSuivant: string | null;
}

interface ElementInerte {
    readonly genre: 'inerte';
    readonly libelle: string;
}

type ElementFil = ElementNiveau | ElementProfond | ElementInerte;

/** Segment d'URL de l'élément : ce qui l'identifie dans le fil. */
function segmentDe(element: ElementFil): string {
    switch (element.genre) {
        case 'niveau': return element.niveau;
        case 'profond': return element.segment.segment;
        case 'inerte': return element.libelle;
    }
}

/**
 * Les éléments du fil pour un chemin donné.
 *
 * Après la descente lue dans l'URL, le premier niveau partagé manquant est
 * proposé (« Choisir ») : choisir une promotion depuis la liste des promotions
 * mène directement à la liste des options, comme dans le rappel du lot 2.
 */
function analyserChemin(
    pathname: string,
    workflow: DescripteurWorkflow,
    prolonges: ReadonlyMap<string, SegmentProlonge>,
    t: TFunction<'app'>,
): ElementFil[] {
    const segments = pathname.split('/').filter(Boolean);
    const elements: ElementFil[] = [];
    let dernierIdentifiant: string | null = null;

    let i = workflow.chemin.split('/').length;
    while (i < segments.length) {
        const segment = segments[i];
        // La condition de boucle le garantit, le compilateur ne le sait pas :
        // le dire ici évite de le réaffirmer à chaque usage.
        if (segment === undefined) break;
        if (SEGMENTS_CRUD.has(segment)) {
            i += 1;
            continue;
        }

        const suivant: string | undefined = segments[i + 1];
        const identifiant = suivant !== undefined && estIdentifiant(suivant) ? suivant : null;
        const cheminListe = `/${segments.slice(0, i + 1).join('/')}`;

        if (estNiveau(segment)) {
            elements.push({ genre: 'niveau', niveau: segment, identifiant, cheminListe });
        } else {
            const prolonge = prolonges.get(segment);
            if (prolonge?.resoudre !== undefined && identifiant !== null) {
                const apres: string | undefined = segments[i + 2];
                const segmentSuivant = apres !== undefined && !SEGMENTS_CRUD.has(apres)
                    && (estNiveau(apres) || prolonges.has(apres)) ? apres : null;
                elements.push({
                    genre: 'profond', segment: prolonge, resoudre: prolonge.resoudre,
                    identifiant, identifiantParent: dernierIdentifiant, cheminListe, segmentSuivant,
                });
            } else {
                // Écran terminal, liste profonde ou segment inconnu : un libellé.
                elements.push({ genre: 'inerte', libelle: prolonge ? libelleSegment(prolonge, t) : segment });
            }
        }

        if (identifiant !== null) {
            dernierIdentifiant = identifiant;
            i += 2;
        } else {
            i += 1;
        }
    }

    const dernier = elements.at(-1);
    if (dernier?.genre === 'niveau' && dernier.identifiant !== null) {
        const rang = workflow.niveaux.indexOf(dernier.niveau);
        const niveau = rang === -1 ? undefined : workflow.niveaux[rang + 1];
        if (niveau !== undefined) {
            elements.push({
                genre: 'niveau', niveau, identifiant: null,
                cheminListe: `${dernier.cheminListe}/${dernier.identifiant}/${niveau}`,
            });
        }
    }

    return elements;
}

function ItemNiveau({ element, valeur, contexte, cheminListe, onChoisir }: {
    element: ElementNiveau;
    valeur: NiveauResolu | undefined;
    contexte: ContexteHierarchique;
    cheminListe: string | undefined;
    onChoisir: (identifiant: string) => void;
}) {
    const depot = useMemo(() => depotFreres(element.niveau, contexte), [element.niveau, contexte]);
    const { t } = useTranslation('app');
    return (
        <SelecteurNiveau
            segment={element.niveau}
            libelle={libelleNiveau(element.niveau, t)}
            valeur={valeur}
            depot={depot}
            cheminListe={cheminListe}
            onChoisir={onChoisir}
        />
    );
}

function ItemProfond({ element, cheminListe, onChoisir }: {
    element: ElementProfond;
    cheminListe: string | undefined;
    onChoisir: (identifiant: string) => void;
}) {
    const { segment, resoudre, identifiant, identifiantParent } = element;
    const { t } = useTranslation('app');

    const fabriqueDepot = segment.depot;
    const depot = useMemo(
        () => identifiantParent !== null && fabriqueDepot !== undefined
            ? fabriqueDepot(identifiantParent)
            : null,
        [fabriqueDepot, identifiantParent],
    );

    const valeur = useNomResolu({
        cle: resoudre.cle(identifiant),
        endpoint: resoudre.endpoint,
        identifiant,
        projeter: resoudre.projeter,
        depotParent: depot,
    });

    return (
        <SelecteurNiveau
            segment={segment.segment}
            libelle={libelleSegment(segment, t)}
            valeur={valeur}
            depot={depot}
            cheminListe={cheminListe}
            onChoisir={onChoisir}
        />
    );
}

export function FilContexte({ workflowCourant }: { workflowCourant: DescripteurWorkflow }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { parUrl, chemins } = useContexteHierarchie();
    const { t } = useTranslation('app');

    const prolonges = useMemo(
        () => prolongementsDuWorkflow(workflowCourant.id),
        [workflowCourant],
    );
    const elements = useMemo(
        () => analyserChemin(pathname, workflowCourant, prolonges, t),
        [pathname, workflowCourant, prolonges, t],
    );

    // Le contexte réellement affiché, d'où les sélecteurs tirent leur parent.
    const contexteAffiche = useMemo<ContexteHierarchique>(() => {
        const contexte: ContexteHierarchique = {};
        for (const element of elements) {
            if (element.genre === 'niveau' && element.identifiant !== null) {
                contexte[element.niveau] = element.identifiant;
            }
        }
        return contexte;
    }, [elements]);

    if (elements.length === 0) return null;

    const choisirNiveau = (niveau: Niveau) => (identifiant: string) => {
        // Les niveaux inférieurs sont abandonnés sans condition : ils décrivent
        // une autre branche. On pourrait les rétablir depuis la mémoire quand
        // ils restent valides, mais choisir une option ferait alors atterrir sur
        // un écran d'unités d'enseignement — une position dictée par une mémoire
        // que l'utilisateur ne voit pas. La descente reste explicite.
        const cible = remplacerNiveau(contexteAffiche, niveau, identifiant);

        // On ne change pas de tâche, seulement de position : même workflow,
        // même écran terminal qu'à la dernière visite.
        const prefere = ecranTerminalDuChemin(
            chemins[workflowCourant.id], workflowCourant.ecransTerminaux,
        );
        void navigate(construireCheminWorkflow(workflowCourant, cible, prefere));
    };

    const choisirProfond = (element: ElementProfond) => (identifiant: string) => {
        const suffixe = element.segmentSuivant === null ? '' : `/${element.segmentSuivant}`;
        void navigate(`${element.cheminListe}/${identifiant}${suffixe}`);
    };

    // « Voir la liste » disparaît quand la liste est déjà l'écran courant.
    const cheminListeUtile = (cheminListe: string) =>
        cheminListe === pathname ? undefined : cheminListe;

    return (
        <nav
            aria-label={t('filContexte.ariaLabel')}
            className="flex flex-row flex-wrap items-center gap-0.5 py-1"
        >
            {elements.map((element, index) => (
                // L'index n'est pas la clé : il départage deux niveaux qui
                // portent le même segment, ce que le segment seul ne fait pas.
                // eslint-disable-next-line react-x/no-array-index-key
                <Fragment key={`${index}-${segmentDe(element)}`}>
                    {index > 0 && (
                        <span aria-hidden className="text-sm text-muted-foreground">
                            ›
                        </span>
                    )}
                    {element.genre === 'niveau' && (
                        <ItemNiveau
                            element={element}
                            valeur={element.identifiant === null
                                ? undefined
                                : parUrl[element.niveau] ?? { identifiant: element.identifiant, nom: null, enChargement: true }}
                            contexte={contexteAffiche}
                            cheminListe={cheminListeUtile(element.cheminListe)}
                            onChoisir={choisirNiveau(element.niveau)}
                        />
                    )}
                    {element.genre === 'profond' && (
                        <ItemProfond
                            element={element}
                            cheminListe={cheminListeUtile(element.cheminListe)}
                            onChoisir={choisirProfond(element)}
                        />
                    )}
                    {element.genre === 'inerte' && (
                        <span
                            aria-current={index === elements.length - 1 ? 'page' : undefined}
                            className="px-2 text-sm text-foreground"
                        >
                            {element.libelle}
                        </span>
                    )}
                </Fragment>
            ))}
        </nav>
    );
}
