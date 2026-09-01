/**
 * Un niveau du fil de contexte, rendu actionnable.
 *
 * Le déclencheur affiche le libellé du niveau et le nom résolu ; le menu qu'il
 * ouvre liste les frères du niveau — pour en changer sans remonter — et se
 * termine par « Voir la liste », qui mène à la liste de ce niveau, là où le
 * lien du fil d'Ariane menait avant la fusion.
 *
 * Le composant ne sait plus rien de la hiérarchie : l'appelant fournit le
 * dépôt des frères (`freres.ts` pour les niveaux partagés, `prolongements.ts`
 * pour les niveaux profonds) et la cible de la liste. C'est ce qui permet au
 * même sélecteur de servir la formation comme le contrôle.
 *
 * Deux propriétés sont défendues ici et ne doivent pas se perdre :
 *
 * - Aucun état ne double l'URL. Le seul état local est l'ouverture du menu,
 *   qui décrit un menu, pas une position dans la hiérarchie. La valeur
 *   affichée reste dérivée de l'URL, et le rechargement la redonne.
 * - Aucune requête au montage. La liste des frères n'est demandée qu'à
 *   l'ouverture — des sélecteurs qui se peupleraient d'eux-mêmes, ce seraient
 *   autant de requêtes de liste sur chaque écran de l'application.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

import { Button } from '../../components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import type { NiveauResolu } from './contexte';
import type { DepotFreres, Frere } from './freres';
import { DUREE_FRAICHEUR_NOMS } from './resolution';

const NOM_INDISPONIBLE = '—';

/**
 * Fraîcheur alignée sur celle des résolutions de nom.
 *
 * Le `QueryClient` de l'application ne fixe pas de `staleTime`, donc la liste
 * chargée par l'écran est périmée dès son arrivée : un observateur sans
 * `staleTime` la redemanderait à l'ouverture du menu, alors même que la donnée
 * est en cache. C'est ce délai qui rend l'ouverture réellement gratuite.
 */
const DUREE_FRAICHEUR = DUREE_FRAICHEUR_NOMS;

/**
 * Au-delà, un menu déroulant devient une zone de défilement aveugle et l'on
 * bascule sur une saisie filtrante. Seules les formations franchissent
 * couramment ce seuil ; les autres niveaux restent en deçà.
 */
const SEUIL_RECHERCHE = 12;

/** Clé inerte : un niveau sans parent connu n'a pas de requête à identifier. */
const CLE_SANS_DEPOT = 'freres-indisponibles';

function normaliser(texte: string): string {
    return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function SelecteurNiveau({ segment, libelle, valeur, depot, cheminListe, onChoisir }: {
    /** Segment d'URL du niveau : identifie le menu, pas autre chose. */
    segment: string;
    libelle: string;
    /** `undefined` pour le niveau suivant, proposé mais pas encore choisi. */
    valeur: NiveauResolu | undefined;
    /** Dépôt des frères du niveau ; `null` sans parent connu. */
    depot: DepotFreres | null;
    /** Cible de « Voir la liste » ; absent quand la liste est l'écran courant. */
    cheminListe?: string;
    onChoisir: (identifiant: string) => void;
}) {
    const { t } = useTranslation('app');
    const [ouvert, setOuvert] = useState(false);
    const [filtre, setFiltre] = useState('');
    const filtreRef = useRef<HTMLInputElement>(null);

    // Le nom n'est pas encore résolu : on garde le squelette et l'on n'ouvre pas.
    const enChargementDuNom = valeur?.enChargement === true;
    // Sans parent connu, il n'y a rien à demander : le déclencheur reste inerte.
    const ouvrable = depot !== null && !enChargementDuNom;

    const versFreres = depot?.versFreres;
    const selectionner = useCallback(
        (donnees: readonly unknown[]) => versFreres?.(donnees) ?? [],
        [versFreres],
    );

    const { data: freres, isError, isFetching, refetch } = useQuery({
        // Exactement la clé du repository : le cache est partagé avec la liste
        // CRUD du même niveau, et l'ouverture ne relance alors aucune requête.
        queryKey: depot?.queryKey ?? [CLE_SANS_DEPOT, segment],
        queryFn: ouvert && depot !== null ? depot.fetchAll : skipToken,
        select: selectionner,
        staleTime: DUREE_FRAICHEUR,
    });

    const filtrables = (freres?.length ?? 0) > SEUIL_RECHERCHE;
    const visibles = useMemo<Frere[]>(() => {
        if (freres === undefined) return [];
        if (!filtrables || filtre === '') return [...freres];
        const recherche = normaliser(filtre);
        return freres.filter(frere => normaliser(frere.nom).includes(recherche));
    }, [freres, filtrables, filtre]);

    const changerOuverture = (estOuvert: boolean) => {
        setOuvert(estOuvert);
        if (!estOuvert) setFiltre('');
    };

    // Le menu Base UI se ferme seul au choix d'une entrée ; ne reste qu'à
    // naviguer — sauf pour rester où l'on est, qui ne le justifie pas.
    const choisir = (frere: Frere) => {
        if (frere.identifiant === valeur?.identifiant) return;
        onChoisir(frere.identifiant);
    };

    const nomAffiche = valeur === undefined ? t('selecteurNiveau.sansSelection') : valeur.nom ?? NOM_INDISPONIBLE;

    return (
        <DropdownMenu
            open={ouvert}
            onOpenChange={changerOuverture}
            // La saisie de filtre prend le focus une fois le menu posé — la
            // parité de l'`autoFocus` du TextField MUI. Sans elle, Base UI
            // focalise la première entrée (ouverture clavier) ou le popup.
            onOpenChangeComplete={(estOuvert) => {
                if (estOuvert && filtrables) filtreRef.current?.focus();
            }}
        >
            {/* Base UI pose lui-même aria-haspopup/expanded/controls sur le
                déclencheur. Le nom accessible porte le niveau : « Réseaux »
                seul ne dit pas qu'il s'agit d'une option. */}
            <DropdownMenuTrigger
                disabled={!ouvrable}
                render={(
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('selecteurNiveau.ariaLabelNiveau', { libelle, nom: nomAffiche })}
                        className="h-auto max-w-[200px] justify-between gap-1 px-2 py-0.5 text-left font-normal"
                    />
                )}
            >
                <span className="min-w-0">
                    {/* Le libellé de niveau est lu, pas seulement survolé. */}
                    <span
                        aria-hidden
                        className="block text-[0.625rem] leading-tight tracking-[0.06em] uppercase text-muted-foreground"
                    >
                        {libelle}
                    </span>
                    {enChargementDuNom
                        ? <Skeleton className="block h-4 w-[72px]" />
                        : (
                            <span
                                aria-hidden
                                className={cn(
                                    'block truncate text-sm leading-snug',
                                    valeur === undefined ? 'italic text-muted-foreground' : 'text-foreground',
                                )}
                            >
                                {nomAffiche}
                            </span>
                        )}
                </span>
                <ArrowDropDownIcon fontSize="small" />
            </DropdownMenuTrigger>

            {/* `w-max` : la largeur suit la plus longue entrée, pas le
                déclencheur (piège du lot 4). */}
            <DropdownMenuContent
                className="w-max min-w-40"
                aria-label={t('selecteurNiveau.changerDe', { libelle: libelle.toLowerCase() })}
            >
                {filtrables && (
                    <div className="px-1.5 pt-1 pb-2">
                        <Input
                            ref={filtreRef}
                            className="h-7"
                            value={filtre}
                            onChange={evenement => { setFiltre(evenement.target.value); }}
                            // Les flèches et Échap reviennent au menu : elles
                            // servent à parcourir la liste et à la refermer.
                            // Le reste de la frappe appartient au filtre — sans
                            // cela, la saisie déclencherait la recherche par
                            // premières lettres du menu.
                            onKeyDown={evenement => {
                                if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(evenement.key)) {
                                    evenement.stopPropagation();
                                }
                            }}
                            placeholder={t('selecteurNiveau.filtrerLes', { libelle: libelle.toLowerCase() })}
                            aria-label={t('selecteurNiveau.filtrerLes', { libelle: libelle.toLowerCase() })}
                        />
                    </div>
                )}

                {isError && (
                    // L'échec reste dans le menu : une liste de frères qui
                    // échoue n'a pas à interrompre le travail en cours —
                    // `closeOnClick={false}`, le réessai garde le menu ouvert.
                    <DropdownMenuItem closeOnClick={false} onClick={() => void refetch()}>
                        <span className="flex flex-col">
                            <span className="text-destructive">{t('selecteurNiveau.chargementImpossible')}</span>
                            <span className="text-xs text-muted-foreground">{t('selecteurNiveau.reessayer')}</span>
                        </span>
                    </DropdownMenuItem>
                )}

                {!isError && freres === undefined && (
                    <DropdownMenuItem disabled>
                        <Skeleton className="h-4 w-[140px]" />
                    </DropdownMenuItem>
                )}

                {!isError && freres !== undefined && visibles.length === 0 && (
                    <DropdownMenuItem disabled>
                        {filtre === '' ? t('selecteurNiveau.aucunElement') : t('selecteurNiveau.aucunResultat')}
                    </DropdownMenuItem>
                )}

                {!isError && visibles.map(frere => (
                    <DropdownMenuItem
                        key={frere.identifiant}
                        // Le frère courant se distingue, comme le `selected`
                        // du MenuItem MUI — le rôle reste `menuitem`.
                        className={cn(frere.identifiant === valeur?.identifiant && 'bg-accent font-medium')}
                        onClick={() => { choisir(frere); }}
                    >
                        {frere.nom}
                    </DropdownMenuItem>
                ))}

                {isFetching && freres !== undefined && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                        {t('selecteurNiveau.actualisation')}
                    </p>
                )}

                {cheminListe !== undefined && <DropdownMenuSeparator />}
                {cheminListe !== undefined && (
                    // L'accès à la liste que le fil d'Ariane offrait : même
                    // cible, désormais au bout du menu du niveau.
                    <DropdownMenuItem render={<RouterLink to={cheminListe} />}>
                        {t('selecteurNiveau.voirLaListe')}
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
