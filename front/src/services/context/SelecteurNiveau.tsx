/**
 * Un niveau du contexte, rendu actionnable.
 *
 * Le déclencheur affiche ce que `RappelContexte` affichait déjà ; le menu qu'il
 * ouvre liste les frères du niveau et permet d'en changer sans repasser par le
 * fil d'Ariane.
 *
 * Deux propriétés sont défendues ici et ne doivent pas se perdre :
 *
 * - Aucun état ne double `parUrl`. Le seul état local est l'ancre du menu, qui
 *   décrit l'ouverture d'un menu, pas une position dans la hiérarchie. La
 *   valeur affichée reste dérivée de l'URL, et le rechargement la redonne.
 * - Aucune requête au montage. La liste des frères n'est demandée qu'à
 *   l'ouverture — quatre sélecteurs qui se peupleraient d'eux-mêmes, ce
 *   seraient quatre requêtes de liste sur chaque écran de l'application.
 */

import { useCallback, useMemo, useState } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
import {
    Box, Button, ListItemText, Menu, MenuItem, Skeleton, TextField, Typography,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

import type { NiveauResolu } from './contexte';
import { LIBELLE_NIVEAU, type ContexteHierarchique, type Niveau } from './niveaux';
import { depotFreres, type Frere } from './freres';

const NOM_INDISPONIBLE = '—';
const SANS_SELECTION = 'Choisir';

/**
 * Fraîcheur alignée sur celle du fournisseur de contexte.
 *
 * Le `QueryClient` de l'application ne fixe pas de `staleTime`, donc la liste
 * chargée par l'écran est périmée dès son arrivée : un observateur sans
 * `staleTime` la redemanderait à l'ouverture du menu, alors même que la donnée
 * est en cache. C'est ce délai qui rend l'ouverture réellement gratuite.
 */
const DUREE_FRAICHEUR = 5 * 60 * 1000;

/**
 * Au-delà, un menu déroulant devient une zone de défilement aveugle et l'on
 * bascule sur une saisie filtrante. Seules les formations franchissent
 * couramment ce seuil ; promotions, options et périodes restent en deçà.
 */
const SEUIL_RECHERCHE = 12;

/** Clé inerte : un niveau sans parent connu n'a pas de requête à identifier. */
const CLE_SANS_DEPOT = 'freres-indisponibles';

function normaliser(texte: string): string {
    return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function SelecteurNiveau({ niveau, valeur, contexte, onChoisir }: {
    niveau: Niveau;
    /** `undefined` pour le niveau suivant, proposé mais pas encore choisi. */
    valeur: NiveauResolu | undefined;
    /** Contexte affiché, d'où se déduit le parent qui filtre les frères. */
    contexte: ContexteHierarchique;
    onChoisir: (niveau: Niveau, identifiant: string) => void;
}) {
    const [ancre, setAncre] = useState<HTMLElement | null>(null);
    const [filtre, setFiltre] = useState('');
    const ouvert = ancre !== null;

    const depot = useMemo(() => depotFreres(niveau, contexte), [niveau, contexte]);

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
        queryKey: depot?.queryKey ?? [CLE_SANS_DEPOT, niveau],
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

    const fermer = () => {
        setAncre(null);
        setFiltre('');
    };

    const choisir = (frere: Frere) => {
        fermer();
        // Rester où l'on est ne justifie pas une navigation.
        if (frere.identifiant === valeur?.identifiant) return;
        onChoisir(niveau, frere.identifiant);
    };

    const libelle = LIBELLE_NIVEAU[niveau];
    const nomAffiche = valeur === undefined ? SANS_SELECTION : valeur.nom ?? NOM_INDISPONIBLE;
    const identifiantMenu = `selecteur-${niveau}`;

    return (
        <>
            <Button
                size="small"
                color="inherit"
                disabled={!ouvrable}
                onClick={evenement => { setAncre(evenement.currentTarget); }}
                aria-haspopup="menu"
                aria-expanded={ouvert}
                aria-controls={ouvert ? identifiantMenu : undefined}
                // Le nom accessible porte le niveau : « Réseaux » seul ne dit
                // pas qu'il s'agit d'une option.
                aria-label={`${libelle} : ${nomAffiche}`}
                endIcon={<ArrowDropDownIcon fontSize="small" />}
                sx={{
                    textTransform: 'none', py: 0.25, px: 1, minWidth: 0, maxWidth: 200,
                    justifyContent: 'space-between', textAlign: 'left',
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    {/* Le libellé de niveau est lu, pas seulement survolé. */}
                    <Typography
                        variant="caption"
                        component="span"
                        aria-hidden
                        sx={{
                            display: 'block', lineHeight: 1.1, letterSpacing: '0.06em',
                            textTransform: 'uppercase', fontSize: '0.625rem',
                            color: 'text.secondary',
                        }}
                    >
                        {libelle}
                    </Typography>
                    {enChargementDuNom
                        ? <Skeleton variant="text" width={72} sx={{ display: 'block' }} />
                        : (
                            <Typography
                                variant="body2"
                                component="span"
                                aria-hidden
                                sx={{
                                    display: 'block', lineHeight: 1.3,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    fontStyle: valeur === undefined ? 'italic' : undefined,
                                    color: valeur === undefined ? 'text.secondary' : 'text.primary',
                                }}
                            >
                                {nomAffiche}
                            </Typography>
                        )}
                </Box>
            </Button>

            <Menu
                id={identifiantMenu}
                anchorEl={ancre}
                open={ouvert}
                onClose={fermer}
                // La saisie de filtre garde le focus ; sans cela le menu le
                // reprend et la frappe est perdue.
                autoFocus={!filtrables}
                slotProps={{ list: { 'aria-label': `Changer de ${libelle.toLowerCase()}`, dense: true } }}
            >
                {filtrables && (
                    <Box sx={{ px: 1.5, pt: 0.5, pb: 1 }}>
                        <TextField
                            autoFocus
                            size="small"
                            fullWidth
                            variant="standard"
                            value={filtre}
                            onChange={evenement => { setFiltre(evenement.target.value); }}
                            // Les flèches et Échap reviennent au menu : elles
                            // servent à parcourir la liste et à la refermer.
                            onKeyDown={evenement => {
                                if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(evenement.key)) {
                                    evenement.stopPropagation();
                                }
                            }}
                            placeholder={`Filtrer les ${libelle.toLowerCase()}s`}
                            aria-label={`Filtrer les ${libelle.toLowerCase()}s`}
                        />
                    </Box>
                )}

                {isError && (
                    // L'échec reste dans le menu : une liste de frères qui
                    // échoue n'a pas à interrompre le travail en cours.
                    <MenuItem onClick={() => void refetch()}>
                        <ListItemText
                            primary="Chargement impossible"
                            secondary="Réessayer"
                            slotProps={{ primary: { color: 'error' } }}
                        />
                    </MenuItem>
                )}

                {!isError && freres === undefined && (
                    <MenuItem disabled>
                        <Skeleton variant="text" width={140} />
                    </MenuItem>
                )}

                {!isError && freres !== undefined && visibles.length === 0 && (
                    <MenuItem disabled>
                        {filtre === '' ? 'Aucun élément' : 'Aucun résultat'}
                    </MenuItem>
                )}

                {!isError && visibles.map(frere => (
                    <MenuItem
                        key={frere.identifiant}
                        selected={frere.identifiant === valeur?.identifiant}
                        onClick={() => { choisir(frere); }}
                    >
                        {frere.nom}
                    </MenuItem>
                ))}

                {isFetching && freres !== undefined && (
                    <Typography variant="caption" sx={{ px: 2, color: 'text.secondary' }}>
                        Actualisation…
                    </Typography>
                )}
            </Menu>
        </>
    );
}
