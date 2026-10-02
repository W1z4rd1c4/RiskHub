import { useState, useEffect } from 'react';
import { Clock, ArrowRight, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { WidgetShell } from '@/components/dashboard/WidgetShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { translateCode } from '@/lib/humanizeCode';
import { useDashboardFilterSelector } from '@/contexts/DashboardFilterContext';
import { kriApi } from '@/services/kriApi';
import type { OverdueKRI, DueSoonKRI } from '@/types/kri';
import { logError } from '@/services/logger';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { TabList, TabPanel, type TabItem } from '@/components/ui/tabs';

type TabType = 'upcoming' | 'overdue';

const STATUS_TABS_ID_PREFIX = 'kri-status';
// Register destinations of the footer link (route + query, not UI copy).
const OVERDUE_KRIS_PATH = '/kris?monitoring_status=not_submitted';
const DUE_SOON_KRIS_PATH = '/kris?timeliness_status=due_soon';

export function KRIStatusWidget() {
    const { t } = useTranslation(['dashboard', 'kris']);
    const departmentId = useDashboardFilterSelector(state => state.filters.departmentId);
    const [activeTab, setActiveTab] = useState<TabType>('upcoming');
    const [overdueKRIs, setOverdueKRIs] = useState<OverdueKRI[]>([]);
    const [dueSoonKRIs, setDueSoonKRIs] = useState<DueSoonKRI[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const params = departmentId ? { department_id: departmentId } : undefined;
                const [overdue, dueSoon] = await Promise.all([
                    kriApi.getOverdue(params),
                    kriApi.getDueSoon(params),
                ]);
                if (!cancelled) {
                    setOverdueKRIs(overdue);
                    setDueSoonKRIs(dueSoon);
                    setError(null);
                }
            } catch (err) {
                logError('Failed to fetch KRI status:', err);
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(t('kri.status_load_failed')));
                    setOverdueKRIs([]);
                    setDueSoonKRIs([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };
        void fetchData();
        return () => {
            cancelled = true;
        };
    }, [departmentId, t]);

    const getUrgencyColor = (days: number, isOverdue: boolean) => {
        if (isOverdue) {
            return days > 7 ? 'text-destructive' : 'text-warning-text';
        } else {
            if (days <= 1) return 'text-destructive';
            if (days <= 4) return 'text-warning-text';
            return 'text-muted-foreground';
        }
    };

    const loadingFallback = (
        <div className="glass-card h-[300px]">
            <LoadingState className="h-full" label={t('common:loading.named', { name: t('kri.status_title') })} testId="widget-loading" />
        </div>
    );

    const hasNoItems = overdueKRIs.length === 0 && dueSoonKRIs.length === 0;

    const emptyFallback = (
        <div className="glass-card h-full">
            <EmptyState
                icon={Clock}
                title={t('kri.all_current')}
                description={t('kri.no_due_soon')}
                className="h-full"
                testId="widget-empty"
            />
        </div>
    );

    const errorFallback = (
        <div className="glass-card h-full">
            <ErrorState title={t('kri.status_load_failed')} className="h-full" testId="widget-error" />
        </div>
    );

    const statusTabs: Array<TabItem<TabType>> = [
        { id: 'upcoming', label: t('kri.upcoming'), icon: CalendarClock },
        { id: 'overdue', label: t('kri.overdue'), icon: AlertTriangle },
    ];

    const currentItems = activeTab === 'upcoming' ? dueSoonKRIs : overdueKRIs;
    const showUpcomingEmpty = activeTab === 'upcoming' && dueSoonKRIs.length === 0;
    const showOverdueEmpty = activeTab === 'overdue' && overdueKRIs.length === 0;

    return (
        <WidgetShell
            title={t('kri.status_title')}
            isLoading={isLoading}
            error={error}
            isEmpty={hasNoItems}
            emptyLabel={t('kri.no_due_soon')}
            loadingFallback={loadingFallback}
            errorFallback={errorFallback}
            emptyFallback={emptyFallback}
        >
            <Card padding="none" className="flex h-full flex-col overflow-hidden">
                {/* Header with tabs */}
                <div className="p-3 border-b border-border bg-tint/[0.03]">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <CalendarClock aria-hidden="true" className="h-4 w-4 text-accent-text" />
                            <CardTitle className="text-base">{t('kri.status_title')}</CardTitle>
                        </div>
                        <div className="flex gap-1">
                            {dueSoonKRIs.length > 0 && (
                                <Badge tone="info">
                                    {t('kri.upcoming_count', { count: dueSoonKRIs.length })}
                                </Badge>
                            )}
                            {overdueKRIs.length > 0 && (
                                <Badge tone="warning">
                                    {t('kri.overdue_count', { count: overdueKRIs.length })}
                                </Badge>
                            )}
                        </div>
                    </div>

                    <TabList
                        tabs={statusTabs}
                        activeTab={activeTab}
                        onChange={setActiveTab}
                        idPrefix={STATUS_TABS_ID_PREFIX}
                        variant="pill"
                        ariaLabel={t('kri.status_views_label')}
                        className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
                    />
                </div>

                {/* Content */}
                <TabPanel
                    tab={activeTab}
                    activeTab={activeTab}
                    idPrefix={STATUS_TABS_ID_PREFIX}
                    className="flex-1 overflow-auto divide-y divide-border"
                >
                    {showUpcomingEmpty && (
                        <EmptyState layout="inline" icon={CalendarClock} title={t('kri.no_due_next_7')} className="justify-center p-6" />
                    )}
                    {showOverdueEmpty && (
                        <EmptyState layout="inline" icon={CheckCircle2} title={t('kri.no_overdue_short')} className="justify-center p-6" />
                    )}
                    {currentItems.length > 5 ? (
                        <p className="p-3 text-xs font-semibold text-muted-foreground">
                            {t('kri.showing', { shown: 5, total: currentItems.length })}
                        </p>
                    ) : null}
                    {currentItems.slice(0, 5).map((kri) => {
                        const isOverdue = activeTab === 'overdue';
                        const days = isOverdue
                            ? (kri as OverdueKRI).days_overdue
                            : (kri as DueSoonKRI).days_until_due;

                        return (
                            <Link
                                key={kri.kri_id}
                                to={`/kris/${kri.kri_id}`}
                                className="p-4 group flex items-center justify-between hover:bg-tint/5 transition-colors focus-ring"
                            >
                                <div className="flex-1 min-w-0 mr-4">
                                    <p className="text-sm font-bold text-foreground truncate mb-0.5 group-hover:text-accent-text transition-colors">
                                        {kri.metric_name}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-x-2">
                                        <span className={`text-xs font-bold ${getUrgencyColor(days, isOverdue)}`}>
                                            {isOverdue
                                                ? t('kri.days_overdue', { count: days })
                                                : t('kri.days_until_due', { count: days })
                                            }
                                        </span>
                                        <span aria-hidden="true" className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                                        <span className="text-xs text-muted-foreground">
                                            {translateCode(t, 'kris:frequencies', kri.frequency)}
                                        </span>
                                    </div>
                                </div>
                                <ArrowRight aria-hidden="true" className="h-3 w-3 text-muted-foreground group-hover:text-accent-text group-hover:translate-x-1 transition-[color,transform]" />
                            </Link>
                        );
                    })}
                </TabPanel>

                <Link
                    to={activeTab === 'overdue' ? OVERDUE_KRIS_PATH : DUE_SOON_KRIS_PATH}
                    className="block w-full border-t border-border bg-tint/[0.03] py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-tint/5 hover:text-foreground focus-ring"
                >
                    {activeTab === 'overdue' ? t('kri.view_all_overdue') : t('kri.view_all')}
                </Link>
            </Card>
        </WidgetShell>
    );
}
