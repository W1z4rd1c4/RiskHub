import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { WidgetShell } from '@/components/dashboard/WidgetShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { useDashboardFilterSelector } from '@/contexts/DashboardFilterContext';
import { kriApi } from '@/services/kriApi';
import { useTranslation } from '@/i18n/hooks';
import { formatKriUnit } from '@/lib/kriUnits';
import type { KeyRiskIndicator } from '@/types/kri';
import { logError } from '@/services/logger';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';

export function KRIBreachWidget() {
    const { t } = useTranslation('dashboard');
    const departmentId = useDashboardFilterSelector(state => state.filters.departmentId);
    const [breaches, setBreaches] = useState<KeyRiskIndicator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchBreaches = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const params = departmentId ? { department_id: departmentId } : undefined;
                const data = await kriApi.getBreaches(params);
                if (!cancelled) {
                    setBreaches(data);
                    setError(null);
                }
            } catch (err) {
                logError('Failed to fetch breaches:', err);
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(t('kri.breaches_load_failed')));
                    setBreaches([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };
        void fetchBreaches();
        return () => {
            cancelled = true;
        };
    }, [departmentId, t]);

    const loadingFallback = (
        <div className="glass-card h-[300px]">
            <LoadingState className="h-full" label={t('common:loading.named', { name: t('kri.active_breaches') })} testId="widget-loading" />
        </div>
    );

    const emptyFallback = (
        <div className="glass-card h-full">
            <EmptyState
                icon={Activity}
                title={t('kri.appetite_maintained')}
                description={t('kri.no_breaches_org')}
                className="h-full"
                testId="widget-empty"
            />
        </div>
    );

    const errorFallback = (
        <div className="glass-card h-full">
            <ErrorState title={t('kri.breaches_load_failed')} className="h-full" testId="widget-error" />
        </div>
    );

    return (
        <WidgetShell
            title={t('kri.active_breaches')}
            isLoading={isLoading}
            error={error}
            isEmpty={breaches.length === 0}
            emptyLabel={t('kri.no_breaches_org')}
            loadingFallback={loadingFallback}
            errorFallback={errorFallback}
            emptyFallback={emptyFallback}
        >
            <Card padding="none" className="flex h-full flex-col overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between bg-tint/[0.03]">
                    <div className="flex items-center gap-2">
                        <AlertTriangle aria-hidden="true" className="h-4 w-4 text-destructive" />
                        <CardTitle className="text-base">{t('kri.active_breaches')}</CardTitle>
                    </div>
                    <Badge tone="danger" data-testid="kri-breach-total">
                        {breaches.length}
                    </Badge>
                </div>

                <div className="flex-1 overflow-auto divide-y divide-border">
                    {breaches.length > 5 ? (
                        <p className="p-3 text-xs font-semibold text-muted-foreground">
                            {t('kri.showing', { shown: 5, total: breaches.length })}
                        </p>
                    ) : null}
                    {breaches.slice(0, 5).map((kri) => (
                        <Link
                            key={kri.id}
                            to={`/risks/${kri.risk_id}`}
                            className="p-4 group flex items-center justify-between hover:bg-tint/5 transition-colors focus-ring"
                        >
                            <div className="flex-1 min-w-0 mr-4">
                                <p className="text-sm font-bold text-foreground truncate mb-0.5 group-hover:text-accent-text transition-colors">
                                    {kri.metric_name}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                    <span>
                                        {t('kri.current_label')}{' '}
                                        <span className="font-semibold text-destructive">
                                            {kri.current_value} {formatKriUnit(kri.unit, t, kri.current_value)}
                                        </span>
                                    </span>
                                    <span aria-hidden="true" className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                                    <span>
                                        {t('kri.limit_label')} {kri.upper_limit} {formatKriUnit(kri.unit, t, kri.upper_limit)}
                                    </span>
                                </div>
                            </div>
                            <ArrowRight aria-hidden="true" className="h-3 w-3 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-[color,transform]" />
                        </Link>
                    ))}
                </div>

                <Link
                    to="/risks?breached=true"
                    className="text-eyebrow block w-full py-3 text-center bg-tint/[0.03] hover:bg-tint/5 hover:text-foreground border-t border-border transition-colors focus-ring"
                >
                    {t('kri.view_risk_register')}
                </Link>
            </Card>
        </WidgetShell>
    );
}
