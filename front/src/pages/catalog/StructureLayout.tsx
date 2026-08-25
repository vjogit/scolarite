/**
 * Le workflow Structure en maître-détail : l'arbre à gauche, le détail à droite.
 *
 * Le panneau n'est pas un écran de plus : c'est l'`<Outlet />` des routes
 * existantes. Sur l'URL d'un nœud il rend le formulaire en consultation, sur
 * l'URL d'un niveau la liste et sa barre d'outils, sur `…/new` et `…/:id/edit`
 * le formulaire dans le mode voulu. La garde d'écriture, la garde de saisie non
 * enregistrée, le focus, les notifications et la corbeille viennent donc avec,
 * sans qu'une ligne les réimplémente : c'est le même code sur les mêmes routes.
 *
 * La sélection et le dépliage se déduisent du seul `pathname` ; sélectionner un
 * nœud navigue vers son URL. Liens partagés, rechargement, retour navigateur et
 * bascule entre tâches en découlent sans effort particulier.
 */

import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
    Box, Divider, Drawer, IconButton, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddBoxIcon from '@mui/icons-material/AddBox';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { BarreWorkflows } from '../../services/context/BarreWorkflows';
import { useDroits } from '../../services/context/droits';
import { WORKFLOW_CATALOG } from '../../services/context/workflows';
import {
    ID_ACTION_VOIR, actionsDeLaLigne, cibleAction, estNavigation,
    type ActionLigne, type ActionRappel,
} from '../../services/crud/actions';
import { DeleteConfirmDialog } from '../../services/crud/DeleteConfirmDialog';
import { MenuActionsLigne } from '../../services/crud/MenuActionsLigne';
import { useSuppressionCrud } from '../../services/crud/suppression';
import { ArbreStructure } from '../structure/arbre/ArbreStructure';
import { useEtatArbre, useNomEnCache, type CibleArbre } from '../structure/arbre/etat';
import { CREER_FORMATION } from '../structure/arbre/niveaux';
import { formationEntite } from '../structure/entites/formation';
import { FORMATION } from '../structure/def';
import { CATALOG_WORKFLOW } from './def';

/** Largeur de l'arbre sur grand écran. */
const LARGEUR_ARBRE = 320;

/** La collection racine : les formations n'ont pas de parent. */
const CHEMIN_RACINE = `/${CATALOG_WORKFLOW}/${FORMATION}`;

/**
 * La suppression est déclarée comme les autres actions, et non dessinée : c'est
 * le bandeau qui détient la modale, il fournit donc le rappel.
 */
function actionSupprimer(ouvrir: () => void, t: TFunction<'crud'>): ActionRappel<FieldValues> {
    return {
        id: 'supprimer',
        libelle: t('actions.supprimer', { ns: 'crud' }),
        icone: DeleteOutlineIcon,
        exigeEcriture: true,
        destructive: true,
        onSelect: ouvrir,
    };
}

/**
 * Les actions du nœud que le panneau détaille.
 *
 * L'objet lui-même est relu sous la clé `[...queryKey, id]` — celle que `Crud`
 * emploie déjà pour alimenter le formulaire affiché à côté. Les deux
 * observateurs se partagent la requête : le bandeau n'en ajoute aucune.
 */
function ActionsNoeud({ cible, nom }: { cible: CibleArbre; nom: string }) {
    const navigate = useNavigate();
    const { peutEcrire } = useDroits();
    const [modaleOuverte, setModaleOuverte] = useState(false);
    const { t } = useTranslation('crud');

    const ecritureAutorisee = peutEcrire(cible.entite);
    const suppression = useSuppressionCrud(cible.entite);

    const { data: objet } = useQuery({
        queryKey: [...cible.entite.queryKey, cible.identifiant],
        queryFn: () => cible.entite.fetch(cible.identifiant),
    });

    const ouvrirModale = useCallback(() => { setModaleOuverte(true); }, []);

    const actions = useMemo(() => {
        if (objet === undefined) return [];
        const declarees = [...cible.niveau.actions(t), actionSupprimer(ouvrirModale, t)];
        // « Voir » mène au nœud déjà affiché : dans le panneau, elle ne fait rien.
        return actionsDeLaLigne(declarees, objet, ecritureAutorisee, t)
            .filter(action => action.id !== ID_ACTION_VOIR);
    }, [cible, objet, ecritureAutorisee, ouvrirModale, t]);

    const executer = useCallback((action: ActionLigne<FieldValues>) => {
        if (objet === undefined) return;
        if (estNavigation(action)) {
            void navigate(cibleAction(action, cible.racine, cible.entite.getId(objet)));
            return;
        }
        action.onSelect(objet);
    }, [cible, navigate, objet]);

    const confirmerSuppression = useCallback(() => {
        if (objet === undefined) return;
        setModaleOuverte(false);
        suppression.mutate(
            { ids: [cible.entite.getId(objet)], noms: [cible.entite.getName(objet)] },
            // La sélection remonte au parent : le nœud supprimé va disparaître.
            { onSuccess: () => { void navigate(cible.retour, { replace: true }); } },
        );
    }, [cible, navigate, objet, suppression]);

    if (actions.length === 0) return null;

    return (
        <>
            <MenuActionsLigne actions={actions} nomLigne={nom} onChoisir={executer} />
            <DeleteConfirmDialog
                open={modaleOuverte}
                entite={cible.entite}
                objets={objet === undefined ? [] : [objet]}
                onClose={() => { setModaleOuverte(false); }}
                onConfirm={confirmerSuppression}
            />
        </>
    );
}

export function StructureLayout() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const theme = useTheme();
    const { peutEcrire } = useDroits();
    const etroit = useMediaQuery(theme.breakpoints.down('md'));
    const { t } = useTranslation('crud');

    const etat = useEtatArbre(pathname, CATALOG_WORKFLOW, t);
    const nom = useNomEnCache(etat.titre?.nomme ?? null);
    const ecritureFormation = peutEcrire(formationEntite(t));

    const [tiroirOuvert, setTiroirOuvert] = useState(false);
    const [deplies, setDeplies] = useState<string[]>(() => [...etat.aDeplier]);
    const [dernierRequis, setDernierRequis] = useState(etat.aDeplier);

    // Le dépliage est l'union de ce que l'URL impose et de ce que l'utilisateur
    // a ouvert : une navigation ne referme jamais une branche ouverte à la main,
    // et replier une branche que l'URL impose reste possible jusqu'à la
    // navigation suivante.
    //
    // L'ajustement se fait pendant le rendu, et non dans un effet : React
    // relance alors le rendu avant tout affichage, là où un effet ferait
    // apparaître l'arbre replié puis le déplierait — un clignotement à chaque
    // lien profond. `etat.aDeplier` étant mémoïsé par chemin, la comparaison
    // d'identité suffit à repérer la navigation.
    if (dernierRequis !== etat.aDeplier) {
        setDernierRequis(etat.aDeplier);
        const manquants = etat.aDeplier.filter(chemin => !deplies.includes(chemin));
        if (manquants.length > 0) setDeplies([...deplies, ...manquants]);
    }

    const selectionner = useCallback((chemin: string) => {
        // Sélectionner ouvre aussi : on vient regarder ce que le nœud contient.
        setDeplies(actuels => actuels.includes(chemin) ? actuels : [...actuels, chemin]);
        setTiroirOuvert(false);
        void navigate(chemin);
    }, [navigate]);

    const arbre = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>Structure</Typography>
                {ecritureFormation && (
                    <Tooltip title={CREER_FORMATION(t).libelle}>
                        <IconButton
                            size="small"
                            aria-label={CREER_FORMATION(t).libelle}
                            onClick={() => { void navigate(`${CHEMIN_RACINE}/new`); }}
                        >
                            <AddBoxIcon />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            <Divider />
            <Box sx={{ flex: 1, overflow: 'auto', px: 0.5 }}>
                <ArbreStructure
                    cheminRacine={CHEMIN_RACINE}
                    selection={etat.selection}
                    deplies={deplies}
                    ecritureAutorisee={ecritureFormation}
                    onDeplier={setDeplies}
                    onSelectionner={selectionner}
                />
            </Box>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <BarreWorkflows workflowCourant={WORKFLOW_CATALOG} />

            <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
                {etroit ? (
                    <Drawer
                        open={tiroirOuvert}
                        onClose={() => { setTiroirOuvert(false); }}
                        slotProps={{ paper: { sx: { width: LARGEUR_ARBRE } } }}
                    >
                        {arbre}
                    </Drawer>
                ) : (
                    <Box
                        sx={{
                            width: LARGEUR_ARBRE, flexShrink: 0,
                            borderRight: 1, borderColor: 'divider',
                        }}
                    >
                        {arbre}
                    </Box>
                )}

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                    <Box
                        sx={{
                            display: 'flex', alignItems: 'center', gap: 1,
                            px: 2, py: 0.5, borderBottom: 1, borderColor: 'divider',
                        }}
                    >
                        {etroit && (
                            <Tooltip title="Arborescence">
                                <IconButton
                                    size="small"
                                    aria-label="Ouvrir l'arborescence"
                                    onClick={() => { setTiroirOuvert(true); }}
                                >
                                    <AccountTreeIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                        {/* Un titre, non une navigation : l'arbre porte déjà
                            celle-ci, et c'est lui qui a remplacé le fil. Il dit
                            de qui le panneau parle, quand le panneau ne dit que
                            de quoi. */}
                        <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 0 }} noWrap>
                            {etat.titre === null || nom === null
                                ? etat.titre?.libelle ?? ''
                                : `${etat.titre.libelle} — ${nom}`}
                        </Typography>
                        {etat.cible !== null && (
                            <ActionsNoeud cible={etat.cible} nom={nom ?? etat.cible.niveau.libelle} />
                        )}
                    </Box>

                    <Box sx={{ flex: 1, overflow: 'auto', p: 2, minHeight: 0 }}>
                        <Outlet />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
