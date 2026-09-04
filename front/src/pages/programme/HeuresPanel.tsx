import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiInstance } from '../../services/api';
import { Progress } from '../../components/ui/progress';
import { Separator } from '../../components/ui/separator';
import { cn } from '../../lib/utils';

interface MatiereHeures {
    matiere_id:        number;
    matiere_name:      string;
    ue_name:           string;
    heures_prevues:    number;
    heures_consommees: number;
}

interface Props {
    periodeId: string;
}

type Teinte = 'primary' | 'warning' | 'error';

/**
 * Barre de consommation — le `LinearProgress` MUI en `Progress` Base UI
 * (rôle `progressbar`, `aria-valuenow` posés par la primitive). Le composant
 * shadcn rend lui-même piste et indicateur ; la teinte se pose depuis la
 * racine, par sélecteur de slot, comme la `color` de MUI.
 */
function Barre({ valeur, teinte = 'primary', className }: { valeur: number; teinte?: Teinte; className?: string }) {
    return (
        <Progress
            value={valeur}
            className={cn(
                teinte === 'error' && '[&_[data-slot=progress-indicator]]:bg-destructive',
                teinte === 'warning' && '[&_[data-slot=progress-indicator]]:bg-warning',
                className,
            )}
        />
    );
}

export function HeuresPanel({ periodeId }: Props) {
    const { t } = useTranslation('programme');
    const { data = [] } = useQuery<MatiereHeures[]>({
        queryKey: ['heures', periodeId],
        queryFn:  () => apiInstance.get<MatiereHeures[]>(`/api/v0/planning/reservation/heures?periode_id=${periodeId}`).then(r => r.data),
        enabled:  !!periodeId,
    });

    const nonAffectees = data.find(m => m.matiere_id === 0);
    const assigned     = data.filter(m => m.matiere_id !== 0);

    const byUe = assigned.reduce<Record<string, MatiereHeures[]>>((acc, m) => {
        (acc[m.ue_name] ??= []).push(m);
        return acc;
    }, {});

    const totalPrevues    = assigned.reduce((s, m) => s + m.heures_prevues,    0);
    const totalConsommees = assigned.reduce((s, m) => s + m.heures_consommees, 0)
                         + (nonAffectees?.heures_consommees ?? 0);
    const totalPct        = totalPrevues > 0 ? Math.min((totalConsommees / totalPrevues) * 100, 100) : 0;

    return (
        <div className="flex w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-3">
            {/* Totaux. `h6` : le `subtitle2` MUI rendait cette balise, et la
                fumée du planning cible le titre en `heading`. */}
            <div>
                <div className="mb-1 flex justify-between">
                    <h6 className="m-0 text-sm font-bold">{t('heuresPanel.totalPeriode')}</h6>
                    <span className="text-xs text-muted-foreground">
                        {totalConsommees.toFixed(1)}&thinsp;/&thinsp;{totalPrevues}h
                    </span>
                </div>
                <Barre valeur={totalPct} className="[&_[data-slot=progress-track]]:h-2" />
            </div>

            <Separator />

            {/* Réservations sans matière */}
            {nonAffectees && nonAffectees.heures_consommees > 0 && (
                <>
                    <div>
                        <span className="text-xs font-bold tracking-wide text-warning uppercase">
                            {t('heuresPanel.sansAffectation')}
                        </span>
                        <div className="mt-1.5">
                            <div className="mb-0.5 flex justify-between">
                                <span className="text-xs font-medium text-warning">
                                    {t('heuresPanel.nonAffectees')}
                                </span>
                                <span className="text-xs text-warning">
                                    {nonAffectees.heures_consommees.toFixed(1)}h
                                </span>
                            </div>
                            <Barre valeur={100} teinte="warning" />
                        </div>
                    </div>
                    <Separator />
                </>
            )}

            {/* Par UE */}
            {Object.entries(byUe).map(([ueName, matieres]) => (
                <div key={ueName}>
                    <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        {ueName}
                    </span>

                    <div className="mt-1.5 flex flex-col gap-3">
                        {matieres.map(m => {
                            const pct        = m.heures_prevues > 0 ? Math.min((m.heures_consommees / m.heures_prevues) * 100, 100) : 0;
                            const depassement = m.heures_consommees > m.heures_prevues;
                            const restant    = Math.max(m.heures_prevues - m.heures_consommees, 0);
                            const teinte: Teinte = depassement ? 'error' : pct >= 80 ? 'warning' : 'primary';

                            return (
                                <div key={m.matiere_id}>
                                    <div className="mb-0.5 flex justify-between">
                                        <span className="max-w-[150px] truncate text-xs font-medium">
                                            {m.matiere_name}
                                        </span>
                                        <span className={cn('text-xs', depassement ? 'text-destructive' : 'text-muted-foreground')}>
                                            {m.heures_consommees.toFixed(1)}&thinsp;/&thinsp;{m.heures_prevues}h
                                        </span>
                                    </div>
                                    <Barre valeur={pct} teinte={teinte} />
                                    <span className={cn('text-[0.65rem]', depassement ? 'text-destructive' : 'text-muted-foreground/60')}>
                                        {depassement
                                            ? t('heuresPanel.depasse', { heures: (m.heures_consommees - m.heures_prevues).toFixed(1) })
                                            : t('heuresPanel.restantes', { heures: restant.toFixed(1) })
                                        }
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
