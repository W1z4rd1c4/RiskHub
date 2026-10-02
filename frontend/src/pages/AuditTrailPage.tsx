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
import { RowActionButton } from '@/components/tables/RowActionButton';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
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
                            <Link to="/activity-log" className={buttonVariants({ variant: 'outline' })}>
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
                            <Button
                                variant="outline"
                                isLoading={isCsvExporting}
                                onClick={() => void downloadCsv(resultFilter || undefined)}
                            >
                                <Sheet aria-hidden="true" />
                                {t('audit_trail.export_csv')}
                            </Button>
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

            <Card padding="compact" className="flex flex-wrap items-center gap-4">
                <Filter aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Field label={t('audit_trail.columns.result')} labelVisuallyHidden className="min-w-[14rem] flex-1">
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={resultFilter}
                            onValueChange={(v) => setResultFilter(v as ExecutionResult | '')}
                            placeholder={t('audit_trail.all_results')}
                            allowEmpty
                            emptyLabel={t('audit_trail.all_results')}
                            className="w-full"
                            options={[
                                { value: 'passed', label: t('results.passed') },
                                { value: 'failed', label: t('results.failed') },
                                { value: 'warning', label: t('results.warning') },
                                { value: 'not_applicable', label: t('results.not_applicable') },
                            ]}
                        />
                    )}
                </Field>
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
                    {t('audit_trail.total_records', { count: totalCount })}
                </div>
            </Card>

            <Card padding="none" className="overflow-hidden">
                <Table>
                    <THead>
                        <TR>
                            <TH>{t('audit_trail.columns.date_time')}</TH>
                            <TH>{t('audit_trail.columns.control')}</TH>
                            <TH>{t('audit_trail.columns.owner')}</TH>
                            <TH>{t('audit_trail.columns.risk')}</TH>
                            <TH>{t('audit_trail.columns.executor')}</TH>
                            <TH align="center">{t('audit_trail.columns.result')}</TH>
                            <TH>{t('audit_trail.columns.key_finding')}</TH>
                            <TH align="right">{t('audit_trail.columns.action')}</TH>
                        </TR>
                    </THead>
                    <TBody key={resultFilter}>
                        {isLoading ? (
                            <TR>
                                <TD colSpan={8} className="p-0">
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
                                </TD>
                            </TR>
                        ) : outcome.kind === 'empty' ? (
                            <TR>
                                <TD colSpan={8} className="p-0">
                                    <EmptyState
                                        layout="section"
                                        kind={resultFilter ? 'no-results' : 'no-data'}
                                        icon={History}
                                        title={t('common:empty.no_executions')}
                                        description={t('audit_trail.no_records_help')}
                                    />
                                </TD>
                            </TR>
                        ) : (
                            executions.map((exec) => {
                                const resultMeta = getExecutionResultMeta(exec.result);
                                const controlName = exec.control_name || exec.control?.name || t('common:fallbacks.unknown_control');
                                return (
                                    <TR
                                        key={exec.id}
                                        className="group cursor-pointer"
                                        onClick={() => navigate(`/controls/${exec.control_id}`)}
                                    >
                                        <TD>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-foreground mb-0.5">
                                                    {format.date(exec.executed_at)}
                                                </span>
                                                <span className="text-xs font-bold text-muted-foreground">
                                                    {format.time(exec.executed_at)}
                                                </span>
                                            </div>
                                        </TD>
                                        <TD>
                                            <span className="block max-w-[200px] truncate text-sm font-bold text-foreground transition-colors group-hover:text-accent-text">
                                                {controlName}
                                            </span>
                                        </TD>
                                        <TD>
                                            <div className="flex items-center gap-2">
                                                <Shield aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-xs font-bold text-muted-foreground">{exec.control_owner_name || t('common:fallbacks.unassigned')}</span>
                                            </div>
                                        </TD>
                                        <TD>
                                            <div className="flex flex-col gap-1">
                                                {exec.linked_risks && exec.linked_risks.length > 0 ? (
                                                    exec.linked_risks.map((risk, i) => (
                                                        <div key={i} className="flex items-center gap-1.5">
                                                            <Target aria-hidden="true" className="h-3 w-3 text-destructive/70" />
                                                            <span className="text-xs font-medium text-muted-foreground">{risk}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">{t('common:empty.no_linked_risks')}</span>
                                                )}
                                            </div>
                                        </TD>
                                        <TD>
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-accent-text">
                                                    <User aria-hidden="true" className="h-3 w-3" />
                                                </div>
                                                <span className="text-xs font-bold text-muted-foreground">{exec.executed_by_name || exec.executed_by?.name || t('common:fallbacks.system')}</span>
                                            </div>
                                        </TD>
                                        <TD align="center">
                                            <Badge tone={resultMeta.tone} icon={resultMeta.icon}>
                                                {t(resultMeta.labelKey)}
                                            </Badge>
                                        </TD>
                                        <TD>
                                            <p className="text-xs text-muted-foreground font-medium line-clamp-1 italic max-w-xs">
                                                "{exec.findings || t('audit_trail.no_findings')}"
                                            </p>
                                        </TD>
                                        <TD align="right">
                                            <RowActionButton
                                                icon={ChevronRight}
                                                label={t('audit_trail.open_control', { name: controlName })}
                                                onClick={() => void navigate(`/controls/${exec.control_id}`)}
                                            />
                                        </TD>
                                    </TR>
                                );
                            })
                        )}
                    </TBody>
                </Table>
            </Card>

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
