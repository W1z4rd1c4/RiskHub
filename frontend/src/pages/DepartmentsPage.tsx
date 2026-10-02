import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, TrendingUp } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/state';
import { ENTITY_ICONS } from '@/constants/entityIcons';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';
import { isForbiddenApiError } from '@/services/apiClient';
import { logError } from '@/services/logger';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';

/** Long localised counts wrap inside the card instead of overflowing it (RS-04, `cs` at 1024px). */
const DEPARTMENT_BADGE_CLASS = 'h-auto max-w-full whitespace-normal break-words py-0.5 uppercase [overflow-wrap:anywhere]';

export function DepartmentsPage() {
    const navigate = useNavigate();
    const { t } = useTranslation(['common', 'dashboard', 'errorKeys']);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);

    const fetchDepartments = async () => {
        try {
            setIsLoading(true);
            setErrorKey(null);
            const data = await departmentApi.getDepartments();
            setDepartments(data);
            setIsAccessDenied(false);
        } catch (err) {
            const accessDenied = isForbiddenApiError(err);
            setIsAccessDenied(accessDenied);
            setDepartments([]);
            setErrorKey(accessDenied ? null : 'errorKeys.load_departments_failed');
            logError('Error fetching departments:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void fetchDepartments();
    }, []);

    if (isAccessDenied) {
        return (
            <PageContainer>
                <PageHeader title={t('dashboard:department_exposure.title')} />
                <ReadAccessDeniedState />
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader
                title={t('dashboard:department_exposure.title')}
                description={t('dashboard:department_exposure.subtitle')}
                actions={(
                    <RefreshButton
                        iconOnly
                        onRefresh={() => void fetchDepartments()}
                        isFetching={isLoading}
                    />
                )}
            />

            {isLoading ? (
                <LoadingState
                    skeleton={(
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="glass-card">
                                    <Skeleton className="mb-6 h-6 w-32" />
                                    <div className="flex items-center gap-6">
                                        <Skeleton className="h-12 w-12" />
                                        <Skeleton className="h-12 w-12" />
                                        <Skeleton className="h-12 w-12" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                />
            ) : errorKey ? (
                // GAP-C-11: a load failure is an error with retry, never "no departments".
                <ErrorState
                    className="glass-card"
                    message={translateUiMessage(t, errorKey)}
                    onRetry={() => void fetchDepartments()}
                />
            ) : departments.length === 0 ? (
                <EmptyState
                    icon={ENTITY_ICONS.department}
                    title={t('dashboard:department_exposure.empty')}
                    className="glass-card p-12"
                />
            ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {departments.map((dept) => (
                        <Card
                            as="button"
                            interactive
                            key={dept.id}
                            onClick={() => navigate(`/departments/${dept.id}`)}
                            className="group hover:border-accent/40"
                        >
                            <div className="mb-6 flex min-w-0 flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-1 items-center gap-4">
                                    <div className="shrink-0 bg-tint/5 p-3 rounded-xl group-hover:bg-accent/10 transition-colors">
                                        <ENTITY_ICONS.department aria-hidden="true" className="size-6 text-muted-foreground group-hover:text-accent-text" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="max-w-full break-words text-lg font-bold text-foreground [overflow-wrap:anywhere] group-hover:text-accent-text transition-colors">
                                            {dept.name}
                                        </h3>
                                        <p className="max-w-full break-words text-xs text-muted-foreground [overflow-wrap:anywhere] font-mono">{dept.code}</p>
                                    </div>
                                </div>
                                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                                    {/* Each badge sits in its own wrapper so the card keeps one status element per slot. */}
                                    {dept.breaching_kri_count > 0 && (
                                        <div className="max-w-full">
                                            <Badge tone="warning" className={DEPARTMENT_BADGE_CLASS}>
                                                {dept.breaching_kri_count} {t('kris:status.breached')}
                                            </Badge>
                                        </div>
                                    )}
                                    {dept.high_risk_count > 0 && (
                                        <div className="max-w-full">
                                            <SeverityBadge
                                                band="critical"
                                                className={DEPARTMENT_BADGE_CLASS}
                                                label={`${dept.high_risk_count} ${t('dashboard:risk_levels.critical')}`}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid min-w-0 grid-cols-2 gap-2 text-center xl:grid-cols-5 [&>div]:min-w-0 [&_span]:max-w-full [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-tint/5">
                                    <Users aria-hidden="true" className="h-4 w-4 text-accent-text" />
                                    <span className="text-lg font-bold text-foreground">{dept.user_count}</span>
                                    <span className="text-xs font-bold text-muted-foreground uppercase">{t('dashboard:department_exposure.people')}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-tint/5">
                                    <ENTITY_ICONS.risk aria-hidden="true" className="h-4 w-4 text-severity-high-text" />
                                    <span className="text-lg font-bold text-foreground">{dept.risk_count}</span>
                                    <span className="text-xs font-bold text-muted-foreground uppercase">{t('risks:title')}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-tint/5">
                                    <ENTITY_ICONS.control aria-hidden="true" className="h-4 w-4 text-chart-2" />
                                    <span className="text-lg font-bold text-foreground">{dept.control_count}</span>
                                    <span className="text-xs font-bold text-muted-foreground uppercase">{t('controls:title')}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-tint/5">
                                    <ENTITY_ICONS.kri aria-hidden="true" className="h-4 w-4 text-success-text" />
                                    <span className="text-lg font-bold text-foreground">{dept.kri_count}</span>
                                    <span className="text-xs font-bold text-muted-foreground uppercase">{t('kris:title')}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-tint/5">
                                    <TrendingUp aria-hidden="true" className="h-4 w-4 text-destructive" />
                                    <span className="text-lg font-bold text-foreground">{dept.total_net_score}</span>
                                    <span className="text-xs font-bold text-muted-foreground uppercase">{t('dashboard:department_exposure.risk_sum')}</span>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </PageContainer>
    );
}

export default DepartmentsPage;
