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
import { ListTree, SquarePlus, Trash2 } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import { Sheet, SheetContent, SheetTitle } from '../../components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { useIsMobile } from '../../hooks/use-mobile';

import { BarreWorkflows } from '../../services/context/BarreWorkflows';
import { useDroits } from '../../services/context/droits';
import { WORKFLOW_CATALOG } from '../../services/context/workflows';
import {
    ID_ACTION_VOIR, actionsDeLaLigne, cibleAction, estNavigation, libelleAction,
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
        icone: Trash2,
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
    const { peutEcrire } = useDroits();
    // Le seuil « écran étroit » est celui du shell shadcn (768 px, `md` de
    // Tailwind), et non plus le `md` de MUI (900 px) : un seul point de
    // rupture pour toute l'application.
    const etroit = useIsMobile();
    const { t } = useTranslation('crud');
    const { t: tCatalog } = useTranslation('catalog');

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
        <div className="flex h-full min-w-0 flex-col">
            {/* Hauteur fixe (`h-11`), non un padding : la rangée ne prend plus
                celle de son contenu — le bouton « créer » est absent sans droit
                d'écriture, et la rangée doit rester à la hauteur de celle du
                panneau, à droite, dont elle est le vis-à-vis. Valeur : celle
                que la rangée mesurait dans son état le plus haut (bouton
                `icon-sm` + `py-2`). */}
            <div className="flex h-11 items-center gap-2 px-3">
                {/* `h6` : le rang que MUI donnait à `subtitle2` — le titre du
                    panneau, plus bas, garde le même rang, et c'est lui que la
                    suite e2e cible en `heading`. */}
                <h6 className="m-0 flex-1 text-sm font-medium leading-6">{tCatalog('structureLayout.titre')}</h6>
                {ecritureFormation && (
                    <Tooltip>
                        <TooltipTrigger
                            render={(
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={libelleAction(CREER_FORMATION(t))}
                                    onClick={() => { void navigate(`${CHEMIN_RACINE}/new`); }}
                                />
                            )}
                        >
                            <SquarePlus />
                        </TooltipTrigger>
                        <TooltipContent>{libelleAction(CREER_FORMATION(t))}</TooltipContent>
                    </Tooltip>
                )}
            </div>
            <Separator />
            <div className="flex-1 overflow-auto px-1">
                <ArbreStructure
                    cheminRacine={CHEMIN_RACINE}
                    selection={etat.selection}
                    deplies={deplies}
                    ecritureAutorisee={ecritureFormation}
                    onDeplier={setDeplies}
                    onSelectionner={selectionner}
                />
            </div>
        </div>
    );

    return (
        // Les deux tokens, fond et texte : la surface cohabite avec la charpente
        // MUI (docs/migration-shadcn/07-datatable.md §8).
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
            <BarreWorkflows workflowCourant={WORKFLOW_CATALOG} />

            <div className="flex min-h-0 flex-1">
                {etroit ? (
                    // Le tiroir de l'écran étroit : sans croix (parité avec le
                    // `Drawer` MUI — la sélection d'un nœud, Échap et le clic
                    // hors panneau le ferment) ; le titre ne s'adresse qu'aux
                    // lecteurs d'écran.
                    <Sheet open={tiroirOuvert} onOpenChange={(ouvert) => { setTiroirOuvert(ouvert); }}>
                        {/* Les largeurs se posent sous la même variante `data-[side=left]`
                            que celles du composant : un `w-80` nu perdrait face à leur
                            sélecteur d'attribut, plus spécifique (constaté au navigateur :
                            tiroir aux trois quarts de l'écran). */}
                        <SheetContent
                            side="left"
                            showCloseButton={false}
                            className="gap-0 p-0 data-[side=left]:w-80 data-[side=left]:sm:max-w-80"
                        >
                            <SheetTitle className="sr-only">{tCatalog('structureLayout.arborescence')}</SheetTitle>
                            {arbre}
                        </SheetContent>
                    </Sheet>
                ) : (
                    <div className="w-80 shrink-0 border-r">
                        {arbre}
                    </div>
                )}

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {/* Hauteur fixe, calée sur la rangée de l'arbre : sans elle la
                        barre prenait la hauteur de son contenu, et en changeait
                        trois fois — titre vide sans sélection, titre seul le temps
                        que `ActionsNoeud` reçoive l'objet, puis le déclencheur du
                        menu (`icon`, 32 px) — et tout le panneau glissait à chaque
                        étape. `box-content` : les 44 px sont ceux du contenu, la
                        bordure s'y ajoute et tombe au niveau du `Separator` de
                        l'arbre, qui est hors de sa rangée. */}
                    <div className="flex h-11 box-content items-center gap-2 border-b px-4">
                        {etroit && (
                            <Tooltip>
                                <TooltipTrigger
                                    render={(
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={tCatalog('structureLayout.ouvrirArborescence')}
                                            onClick={() => { setTiroirOuvert(true); }}
                                        />
                                    )}
                                >
                                    <ListTree />
                                </TooltipTrigger>
                                <TooltipContent>{tCatalog('structureLayout.arborescence')}</TooltipContent>
                            </Tooltip>
                        )}
                        {/* Un titre, non une navigation : l'arbre porte déjà
                            celle-ci, et c'est lui qui a remplacé le fil. Il dit
                            de qui le panneau parle, quand le panneau ne dit que
                            de quoi. */}
                        <h6 className="m-0 min-w-0 flex-1 truncate text-base font-normal leading-7">
                            {etat.titre === null || nom === null
                                ? etat.titre?.libelle ?? ''
                                : `${etat.titre.libelle} — ${nom}`}
                        </h6>
                        {etat.cible !== null && (
                            <ActionsNoeud cible={etat.cible} nom={nom ?? etat.cible.niveau.libelle} />
                        )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto p-4">
                        <Outlet />
                    </div>
                </div>
            </div>
        </div>
    );
}
