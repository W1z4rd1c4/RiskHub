import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthz } from '@/authz/useAuthz';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import {
    ClipboardCheck,
    Filter,
    ChevronRight,
    User,
    History,
    Sheet,
    Shield,
    Target,
} from 'lucide-react';
import { executionApi } from '@/services/executionApi';
import { reportApi } from '@/services/reportApi';
import type { ExecutionAuditItem, ExecutionListCapabilities, ExecutionResult } from '@/types/execution';
import { Pagination } from '@/components/tables';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/state';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { getExecutionResultMeta } from '@/lib/executionResult';
import { logError } from '@/services/logger';
import {
    resolveCollectionOutcome,
    useCollectionDataState,
    useLatestRequestGuard,
} from '@/pages/shared/collectionPageState';

const AUDIT_TRAIL_SKELETON_ROWS = 5;

export function AuditTrailPage() {
    const { t } = useTranslation(['controls', 'common']);
    const format = useFormat();
    const authz = useAuthz();
    const navigate = useNavigate();

    const {
        applyFailure,
        applySuccess,
        beginQuery,
        forQuery,
        isLoading: collectionIsLoading,
        setIsLoading,
    } = useCollectionDataState<ExecutionAuditItem, ExecutionListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const [resultFilter, setResultFilter] = useState<ExecutionResult | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isCsvExporting, setIsCsvExporting] = useState(false);
    const [csvError, setCsvError] = useState<{ result?: ExecutionResult } | null>(null);
    const limit = 50;
    const queryKey = `${currentPage}:${resultFilter}`;
    const queryState = forQuery(queryKey);
    const {
        capabilities,
        items: executions,
        totalCount,
    } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const outcome = resolveCollectionOutcome(queryState, isLoading);

    const fetchExecutions = useCallback(async () => {
        const requestQuery = queryKey;
        const requestId = beginRequest();
        setIsLoading(true);
        try {
            const skip = (currentPage - 1) * limit;
            const data = await executionApi.getExecutions({
                skip,
                limit,
                result: resultFilter || undefined
            });
            if (!isCurrentRequest(requestId)) return;
            applySuccess(requestQuery, {
                items: data.items,
                groups: [],
                capabilities: data.capabilities ?? null,
                total: data.total,
            });
        } catch (err) {
            if (!isCurrentRequest(requestId)) return;
            applyFailure(err, { fallbackErrorKey: 'common:tables.error.message' });
            logError('Failed to fetch audit trail:', err);
        } finally {
            if (isCurrentRequest(requestId)) {
                setIsLoading(false);
            }
        }
    }, [
        applyFailure,
        applySuccess,
        beginRequest,
        currentPage,
        isCurrentRequest,
        queryKey,
        resultFilter,
        setIsLoading,
    ]);

    const downloadCsv = useCallback(async (result?: ExecutionResult) => {
        setIsCsvExporting(true);
        setCsvError(null);
        try {
            await reportApi.downloadAuditTrailCsv({ result });
        } catch (error) {
            logError('Failed to download audit trail CSV.', error);
            setCsvError({ result });
        } finally {
            setIsCsvExporting(false);
        }
    }, []);

    // Reset page when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [resultFilter]);

    useEffect(() => {
        beginQuery(queryKey);
        void fetchExecutions();
    }, [beginQuery, fetchExecutions, queryKey]);

    // D7: the page title is the route's `h1` and `document.title` in every state.
    if (outcome.kind === 'denied') {
        return (
            <PageContainer>
                <PageHeader title={t('audit_trail.title')} />
                <AccessDeniedState descriptionKey="access.denied_control_execution_history" />
            </PageContainer>
        );
    }

    if (outcome.kind === 'fatal-error') {
        return (
            <PageContainer>
                <PageHeader title={t('audit_trail.title')} description={t('audit_trail.subtitle')} />
                <ErrorState
                    message={translateUiMessage(t, outcome.errorKey)}
                    onRetry={() => void fetchExecutions()}
                    retryLabel={t('common:actions.retry')}
                    isRetrying={outcome.isRetrying}
                />
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader
                title={t('audit_trail.title')}
                description={t('audit_trail.subtitle')}
                actions={(
                    <>
                        {authz.canViewActivityLog ? (
                            <Link
                                to="/activity-log"
                                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-bold text-foreground"
                            >
                                {t('admin:activity_log.title')}
                            </Link>
                        ) : null}
                        <RefreshButton
                            variant="outline"
                            label={t('common:actions.refresh')}
                            onRefresh={() => void fetchExecutions()}
                            isFetching={isLoading}
                        />
                        {resolveCapabilityFlag(capabilities, 'can_export_csv') ? (
                            <button
                                type="button"
                                aria-busy={isCsvExporting}
                                disabled={isCsvExporting}
                                onClick={() => void downloadCsv(resultFilter || undefined)}
                                className="px-4 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-accent-text transition-colors bg-tint/5 rounded-lg border border-border flex items-center gap-2 hover:bg-accent/10 hover:border-accent/20 disabled:cursor-wait disabled:opacity-60"
                            >
                                <Sheet className="h-3.5 w-3.5" />
                                CSV
                            </button>
                        ) : null}
                    </>
                )}
            />

            {outcome.kind === 'stale-with-error' ? (
                <ErrorState
                    variant="banner"
                    message={translateUiMessage(t, outcome.errorKey)}
                    onRetry={() => void fetchExecutions()}
                    retryLabel={t('common:actions.retry')}
                    isRetrying={outcome.isRetrying}
                />
            ) : null}

            {csvError ? (
                <ErrorState
                    variant="banner"
                    message={t('common:export.errors.failed')}
                    onRetry={() => void downloadCsv(csvError.result)}
                    retryLabel={t('common:actions.retry')}
                />
            ) : null}

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 glass-card flex items-center gap-4 !py-3">
                    <div className="flex items-center gap-3 px-4 py-2 bg-tint/5 rounded-xl border border-border group focus-within:border-accent/50 transition-all flex-1">
                        <Filter className="h-4 w-4 text-muted-foreground group-focus-within:text-accent" />
                        <ThemedSelect
                            value={resultFilter}
                            onValueChange={(v) => setResultFilter(v as ExecutionResult | '')}
                            placeholder={t('audit_trail.all_results')}
                            allowEmpty
                            emptyLabel={t('audit_trail.all_results')}
                            className="flex-1"
                            options={[
                                { value: 'passed', label: t('results.passed') },
                                { value: 'failed', label: t('results.failed') },
                                { value: 'warning', label: t('results.warning') },
                                { value: 'not_applicable', label: t('results.not_applicable') },
                            ]}
                        />
                    </div>

                    <div className="h-8 w-px bg-tint/10 hidden md:block" />

                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground px-4">
                        <ClipboardCheck className="h-4 w-4" />
                        {t('audit_trail.total_records', { count: totalCount })}
                    </div>
                </div>
            </div>

            <div className="glass-card !p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-tint/[0.03]">
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('audit_trail.columns.date_time')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('audit_trail.columns.control')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('audit_trail.columns.owner')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('audit_trail.columns.risk')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('audit_trail.columns.executor')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">{t('audit_trail.columns.result')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('audit_trail.columns.key_finding')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">{t('audit_trail.columns.action')}</th>
                            </tr>
                        </thead>
                        <tbody
                            key={resultFilter}
                        >
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="p-0">
                                        <LoadingState
                                            label={t('common:loading.data')}
                                            skeleton={(
                                                <div className="divide-y divide-border">
                                                    {Array.from({ length: AUDIT_TRAIL_SKELETON_ROWS }, (_, i) => (
                                                        <div key={`skeleton-${i}`} className="px-6 py-6">
                                                            <Skeleton className="h-4 w-full max-w-3xl" />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        />
                                    </td>
                                </tr>
                            ) : outcome.kind === 'empty' ? (
                                <tr>
                                    <td colSpan={8} className="p-0">
                                        <EmptyState
                                            layout="section"
                                            kind={resultFilter ? 'no-results' : 'no-data'}
                                            icon={History}
                                            title={t('common:empty.no_executions')}
                                            description={t('audit_trail.no_records_help')}
                                        />
                                    </td>
                                </tr>
                            ) : (
                                executions.map((exec) => {
                                    const resultMeta = getExecutionResultMeta(exec.result);
                                    const ResultIcon = resultMeta.icon;
                                    return (
                                        <tr
                                            key={exec.id}
                                            className="border-b border-border hover:bg-tint/[0.03] transition-colors group cursor-pointer"
                                            onClick={() => navigate(`/controls/${exec.control_id}`)}
                                        >
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-foreground mb-0.5">
                                                        {format.date(exec.executed_at)}
                                                    </span>
                                                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">
                                                        {format.time(exec.executed_at)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-foreground group-hover:text-accent-text transition-colors truncate max-w-[200px]">
                                                        {exec.control_name || exec.control?.name || t('common:fallbacks.unknown_control')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2">
                                                    <Shield className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-xs font-bold text-muted-foreground">{exec.control_owner_name || t('common:fallbacks.unassigned')}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col gap-1">
                                                    {exec.linked_risks && exec.linked_risks.length > 0 ? (
                                                        exec.linked_risks.map((risk, i) => (
                                                            <div key={i} className="flex items-center gap-1.5">
                                                                <Target className="h-3 w-3 text-destructive/70" />
                                                                <span className="text-xs font-medium text-muted-foreground">{risk}</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground italic">{t('common:empty.no_linked_risks')}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-black text-accent-text">
                                                        <User className="h-3 w-3" />
                                                    </div>
                                                    <span className="text-xs font-bold text-muted-foreground">{exec.executed_by_name || exec.executed_by?.name || t('common:fallbacks.system')}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex justify-center">
                                                    <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${resultMeta.badgeClassName}`}>
                                                        <ResultIcon className={`h-4 w-4 ${resultMeta.iconClassName}`} />
                                                        {t(resultMeta.labelKey)}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className="text-xs text-muted-foreground font-medium line-clamp-1 italic max-w-xs">
                                                    "{exec.findings || t('audit_trail.no_findings')}"
                                                </p>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void navigate(`/controls/${exec.control_id}`);
                                                    }}
                                                    aria-label={t('audit_trail.open_control', {
                                                        name: exec.control_name || exec.control?.name || t('common:fallbacks.unknown_control'),
                                                    })}
                                                    className="p-2 text-muted-foreground group-hover:text-foreground transition-colors"
                                                >
                                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / limit) || 1}
                totalItems={totalCount}
                itemsPerPage={limit}
                onPageChange={setCurrentPage}
            />
        </PageContainer>
    );
}

export default AuditTrailPage;
