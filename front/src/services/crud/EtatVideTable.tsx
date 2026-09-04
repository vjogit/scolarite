/**
 * Le repli d'une table vide : orienter plutôt que constater.
 *
 * Deux vides n'appellent pas la même réponse, et c'est tout l'objet de ce
 * composant. Une collection réellement vide est un début : on propose de la
 * remplir. Une collection vidée par un filtre est un cul-de-sac : proposer d'y
 * créer un objet serait un contresens — l'objet cherché existe peut-être déjà,
 * hors du filtre. On propose alors d'effacer le filtre, et rien d'autre.
 *
 * Le troisième cas — le prérequis non rempli, une grille sans groupe choisi —
 * ne passe pas par ici : la table n'est pas montée du tout, l'écran affiche
 * son invite à sa place.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';

/** Ce que propose l'écran quand la collection est réellement vide. */
export interface ActionEtatVide {
    readonly libelle: string;
    readonly onClick: () => void;
}

/**
 * Le strict nécessaire d'une instance de table : lire l'état de filtre, le
 * vider. Type structurel plutôt qu'import d'un moteur — l'instance MRT
 * (`GroupeUserPage`, `JuryPeriode`) et l'instance TanStack du nouveau socle
 * le satisfont toutes deux, ce composant survit donc à la migration sans
 * que ses consommateurs bougent.
 */
export interface TableEtatFiltre {
    getState(): { columnFilters: readonly unknown[]; globalFilter?: unknown };
    setColumnFilters(valeur: never[]): void;
    setGlobalFilter(valeur: string): void;
}

interface Props {
    readonly table: TableEtatFiltre;
    /** Constat de collection vide, déjà accordé par `entityMessages`. */
    readonly message: string;
    /**
     * Invite de création. Absente, le message reste seul : c'est ce que voit
     * un compte sans droit d'écriture.
     */
    readonly action?: ActionEtatVide;
}

export function EtatVideTable({ table, message, action }: Props) {
    const { t } = useTranslation('crud');
    // `globalFilter` est typé `any` par la table : on ne le lit que pour sa
    // vacuité, jamais pour sa valeur.
    const etat = table.getState();
    const filtree = etat.columnFilters.length > 0 || Boolean(etat.globalFilter);

    // On repasse par les setters de la table, donc par l'état persisté de
    // l'écran : `resetGlobalFilter` rendrait `undefined` là où il est typé
    // `string`, et le filtre resterait en session.
    const effacerFiltres = () => {
        table.setColumnFilters([]);
        table.setGlobalFilter('');
    };

    const contenu: { message: string; action?: ActionEtatVide } = filtree
        ? {
            message: t('listeVideFiltree'),
            action: { libelle: t('effacerFiltres'), onClick: effacerFiltres },
        }
        : { message, action };

    return (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
                {contenu.message}
            </p>
            {contenu.action && (
                <Button variant="outline" size="sm" onClick={contenu.action.onClick}>
                    {contenu.action.libelle}
                </Button>
            )}
        </div>
    );
}
