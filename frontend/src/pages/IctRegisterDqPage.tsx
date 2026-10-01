import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, CircleDashed } from 'lucide-react';

import { RegisterExportLink } from '@/components/ict-register/RegisterExportLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/tables/Pagination';
import { TableErrorState, useTableErrorContract } from '@/components/tables/tableError';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n/hooks';
import type { SeverityBand } from '@/lib/severity';
import { apiClient, isForbiddenApiError } from '@/services/apiClient';
import { ictRegisterDqApi } from '@/services/ictRegisterDqApi';
import type { IctDqCheck, IctDqViolationsPage, IctRegisterDq } from '@/types/ictRegisterDq';

import {
    DQ_DETAIL_PAGE_SIZE,
    dqAreaKey,
    dqSeverityKey,
    filterChecks,
    isFinding,
    isProductionInert,
    localizeRegisterRowLabel,
    parseDqPageQueryParams,
    summarizeChecks,
    violatingRowPath,
} from './ictRegisterDq/dqPresentation';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { LoadingState } from '@/components/ui/state';

function StatusPill({ check }: { check: IctDqCheck }) {
    const { t } = useTranslation('ictRegisterDq');
    const testId = `dq-status-${check.check_id}`;
    if (isFinding(check)) {
        return (
            <Badge data-testid={testId} tone="danger" icon={AlertCircle}>
                {t('status.finding')}
            </Badge>
        );
    }
    if (isProductionInert(check)) {
        // A quiet check with no app column feeding it (DQ-23): muted "not
        // yet measurable", never a false OK.
        return (
            <Badge data-testid={testId} tone="neutral" icon={CircleDashed} title={t('status.not_measurable_hint')}>
                {t('status.not_measurable')}
            </Badge>
        );
    }
    return (
        <Badge data-testid={testId} tone="success" icon={CheckCircle2}>
            {t('status.ok')}
        </Badge>
    );
}

/** DQ severities on the D1 scale (medium → warning, high → severity-high, critical → danger). */
const DQ_SEVERITY_BAND: Readonly<Record<string, SeverityBand>> = {
    medium: 'medium',
    high: 'high',
    critical: 'critical',
};

function SeverityChip({ severity }: { severity: string }) {
    const { t } = useTranslation('ictRegisterDq');
    const key = dqSeverityKey(severity);
    const band = key ? DQ_SEVERITY_BAND[key] : undefined;
    if (!key || !band) {
        return <Badge tone="neutral">{severity}</Badge>;
    }
    return <SeverityBadge band={band} label={t(`severity.${key}`)} />;
}

interface DqDetailState {
    page: IctDqViolationsPage | null;
    isLoading: boolean;
    hasError: boolean;
}

function ViolatingRows({
    check,
    detail,
    onRetry,
    onPage,
}: {
    check: IctDqCheck;
    detail: DqDetailState | undefined;
    onRetry: () => void;
    onPage: (offset: number) => void;
}) {
    const { t } = useTranslation('ictRegisterDq');
    const rows = detail?.page?.items ?? check.violating_rows;
    const page = detail?.page;
    const showRows = !detail?.isLoading && !detail?.hasError;
    return (
        <div className="mt-3 border-t border-tint/10 pt-3 space-y-1.5">
            {detail?.isLoading ? (
                <p role="status" className="text-muted-foreground text-sm">
                    {t('rows_loading')}
                </p>
            ) : null}
            {detail?.hasError ? (
                <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
                    <span>{t('rows_error')}</span>
                    <button type="button" className="underline" onClick={onRetry}>
                        {t('actions.retry_rows')}
                    </button>
                </div>
            ) : null}
            {showRows && rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('rows_empty')}</p>
            ) : null}
            {showRows
                ? rows.map((row, index) => {
                      const path = violatingRowPath(row);
                      const label = (
                          <>
                              <span className="text-muted-foreground text-xs uppercase tracking-wide mr-2">
                                  {t(`entities.${row.entity_type}`, {
                                      defaultValue: row.entity_type,
                                  })}
                              </span>
                              {localizeRegisterRowLabel(row.label, t)}
                          </>
                      );
                      return (
                          <div
                              key={`${row.entity_type}-${row.entity_id}-${index}`}
                              className="text-sm"
                          >
                              {path ? (
                                  <Link
                                      to={path}
                                      className="text-foreground hover:text-accent-text transition-colors underline decoration-border hover:decoration-accent"
                                  >
                                      {label}
                                  </Link>
                              ) : (
                                  <span className="text-foreground">{label}</span>
                              )}
                          </div>
                      );
                  })
                : null}
            {page && page.total > page.limit ? (
                <Pagination
                    mode="cursor"
                    className="pt-3"
                    hasPrevious={page.offset > 0}
                    hasNext={page.offset + page.limit < page.total}
                    isLoading={detail?.isLoading}
                    onPrevious={() => onPage(Math.max(0, page.offset - page.limit))}
                    onNext={() => onPage(page.offset + page.limit)}
                    summary={t('rows_page', {
                        from: page.offset + 1,
                        to: Math.min(page.offset + page.items.length, page.total),
                        total: page.total,
                    })}
                />
            ) : null}
        </div>
    );
}

export function IctRegisterDqPage() {
    const { t } = useTranslation('ictRegisterDq');
    // Committee drill-down deep links (#51): ?check= pre-expands the
    // producing check; ?status=findings pre-applies the findings filter.
    const [searchParams, setSearchParams] = useSearchParams();
    const queryState = parseDqPageQueryParams(searchParams);
    const [data, setData] = useState<IctRegisterDq | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [details, setDetails] = useState<Record<string, DqDetailState>>({});
    const activeDetail = useRef<{ checkId: string; offset: number } | null>(null);
    const detailGeneration = useRef(0);
    activeDetail.current = queryState.expandedCheckId
        ? { checkId: queryState.expandedCheckId, offset: queryState.detailOffset }
        : null;

    useEffect(() => {
        const rawOffset = searchParams.get('dq_offset');
        if (
            queryState.expandedCheckId &&
            rawOffset !== null &&
            rawOffset !== String(queryState.detailOffset)
        ) {
            const next = new URLSearchParams(searchParams);
            next.set('dq_offset', String(queryState.detailOffset));
            setSearchParams(next, { replace: true });
        }
    }, [
        queryState.detailOffset,
        queryState.expandedCheckId,
        searchParams,
        setSearchParams,
    ]);

    const fetchDq = useCallback(async () => {
        setIsLoading(true);
        setErrorKey(null);
        try {
            setData(await ictRegisterDqApi.getDataQuality());
            setIsAccessDenied(false);
        } catch (error) {
            if (isForbiddenApiError(error)) {
                setIsAccessDenied(true);
            } else {
                setErrorKey(apiClient.toUiMessageKey(error));
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchDq();
    }, [fetchDq]);

    const fetchViolations = useCallback(async (checkId: string, offset: number) => {
        const generation = ++detailGeneration.current;
        const isActiveRequest = () => {
            const active = activeDetail.current;
            return (
                generation === detailGeneration.current &&
                active?.checkId === checkId &&
                active.offset === offset
            );
        };
        setDetails((current) => ({
            ...current,
            [checkId]: {
                page: current[checkId]?.page ?? null,
                isLoading: true,
                hasError: false,
            },
        }));
        try {
            const page = await ictRegisterDqApi.getViolations(checkId, {
                offset,
                limit: DQ_DETAIL_PAGE_SIZE,
            });
            if (!isActiveRequest()) {
                return;
            }
            const lastOffset =
                page.total === 0
                    ? 0
                    : Math.floor((page.total - 1) / DQ_DETAIL_PAGE_SIZE) *
                      DQ_DETAIL_PAGE_SIZE;
            if (offset > lastOffset) {
                setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set('dq_offset', String(lastOffset));
                    return next;
                }, { replace: true });
                return;
            }
            setDetails((current) => ({
                ...current,
                [checkId]: { page, isLoading: false, hasError: false },
            }));
        } catch {
            if (!isActiveRequest()) {
                return;
            }
            setDetails((current) => ({
                ...current,
                [checkId]: {
                    page: current[checkId]?.page ?? null,
                    isLoading: false,
                    hasError: true,
                },
            }));
        }
    }, [setSearchParams]);

    useEffect(() => {
        const checkId = queryState.expandedCheckId;
        if (!data || !checkId) return;
        const check = data.checks.find((entry) => entry.check_id === checkId);
        const visibleCount = check?.visible_count ?? check?.violating_rows.length ?? 0;
        if (visibleCount > 0) {
            void fetchViolations(checkId, queryState.detailOffset);
        }
    }, [data, fetchViolations, queryState.detailOffset, queryState.expandedCheckId]);

    const updateExpandedCheck = (checkId: string | null, offset = 0) => {
        const next = new URLSearchParams(searchParams);
        if (checkId) {
            next.set('check', checkId);
            next.set('dq_offset', String(offset));
        } else {
            next.delete('check');
            next.delete('dq_offset');
        }
        setSearchParams(next);
    };

    // FR-P3-4 (N17 / C3 / C4): the DQ screen does not consume SortableTable, so it
    // drives the shared table-error contract directly. `hasData` decides whether a
    // failed fetch replaces the screen (first load) or overlays a retry banner above
    // the last-good summary — a dropped request is never a false 0/0/0.
    const hasData = data !== null;
    const errorContract = useTableErrorContract({ isError: errorKey !== null, hasData });

    // D7: the page title is the route's one `h1` (and `document.title`) in every state.
    const pageHeader = <PageHeader title={t('title')} description={t('subtitle')} />;

    if (isAccessDenied) {
        return (
            <PageContainer>
                {pageHeader}
                <ReadAccessDeniedState />
            </PageContainer>
        );
    }

    // Explicit aria-busy loading branch — only while there is nothing to show yet.
    // A refetch over existing data keeps the (stale) summary and spins the refresh
    // button instead of flashing 0/0/0 during load (C3).
    if (isLoading && !hasData) {
        return (
            <PageContainer>
                {pageHeader}
                <div data-loading="true">
                    <LoadingState label={t('loading')} testId="dq-loading" className="py-24" />
                </div>
            </PageContainer>
        );
    }

    // Failed first load with no last-good data → replace the screen with the shared
    // localized error + retry, never an empty/zero state (C4, N17).
    if (errorContract.showErrorBlock) {
        return (
            <PageContainer>
                {pageHeader}
                <TableErrorState
                    onRetry={() => void fetchDq()}
                    isRetrying={isLoading}
                    testId="dq-error"
                />
            </PageContainer>
        );
    }

    const checks = data?.checks ?? [];
    const summary = summarizeChecks(checks);
    const visibleChecks = filterChecks(checks, queryState.statusFilter);

    return (
        <PageContainer>
            <PageHeader
                title={t('title')}
                description={t('subtitle')}
                actions={(
                    <>
                        {/* FR-P5-8 (S2 / N21): discoverability link to the register export,
                            gated on the separate can_download_dora_register capability. */}
                        <RegisterExportLink className="px-5 py-2.5 rounded-xl bg-accent border border-accent text-accent-foreground font-bold hover:bg-accent-hover transition-colors flex items-center gap-2 w-fit" />
                        <RefreshButton
                            label={t('actions.refresh')}
                            onRefresh={() => void fetchDq()}
                            isFetching={isLoading}
                            data-testid="dq-refresh-button"
                        />
                    </>
                )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card">
                    <p className="text-muted-foreground text-sm font-medium">{t('summary.checks')}</p>
                    <p data-testid="dq-summary-total" className="text-3xl font-bold text-foreground mt-1">
                        {summary.total}
                    </p>
                </div>
                <div className="glass-card">
                    <p className="text-muted-foreground text-sm font-medium">{t('summary.findings')}</p>
                    <p data-testid="dq-summary-findings" className="text-3xl font-bold text-destructive mt-1">
                        {summary.findings}
                    </p>
                </div>
                <div className="glass-card">
                    <p className="text-muted-foreground text-sm font-medium">{t('summary.ok')}</p>
                    <p data-testid="dq-summary-ok" className="text-3xl font-bold text-success-text mt-1">
                        {summary.ok}
                    </p>
                </div>
            </div>

            {/* S10 (FR-P5-5): a positive all-clear when the register has checks but
                zero findings — never a bare "0" that reads like missing data. */}
            {summary.total > 0 && summary.findings === 0 ? (
                <div
                    data-testid="dq-all-clear"
                    className="flex items-center gap-3 rounded-2xl border border-success/20 bg-success/5 p-6 shadow-glass backdrop-blur-xl"
                >
                    <CheckCircle2 className="h-6 w-6 text-success-text shrink-0" aria-hidden="true" />
                    <div>
                        <p className="text-success-text font-bold">{t('all_clear.title')}</p>
                        <p className="text-muted-foreground text-sm">
                            {summary.notMeasurable > 0
                                ? t('all_clear.body_with_unmeasurable', {
                                      passed: summary.ok,
                                      notMeasurable: summary.notMeasurable,
                                  })
                                : t('all_clear.body', { count: summary.total })}
                        </p>
                    </div>
                </div>
            ) : null}

            <div className="glass-card flex flex-col md:flex-row md:items-center gap-4">
                <p className="text-muted-foreground text-sm font-medium flex-1">{t('filters.label')}</p>
                <ThemedSelect
                    value={queryState.statusFilter}
                    onValueChange={(value) => {
                        const next = new URLSearchParams(searchParams);
                        if (value === 'findings') {
                            next.set('status', 'findings');
                        } else {
                            next.delete('status');
                        }
                        setSearchParams(next);
                    }}
                    options={[
                        { value: 'all', label: t('filters.all') },
                        { value: 'findings', label: t('filters.findings') },
                    ]}
                />
            </div>

            {/* Refetch failed while last-good data is shown → non-blocking banner over
                the stale summary (error-overlay), never a silent revert to empty. */}
            {errorContract.showErrorBanner && (
                <TableErrorState
                    variant="banner"
                    onRetry={() => void fetchDq()}
                    isRetrying={isLoading}
                    testId="dq-error-banner"
                />
            )}

            <div className="space-y-3" data-testid="dq-check-list">
                {visibleChecks.map((check) => {
                    const visibleCount = check.visible_count ?? check.violating_rows.length;
                    const isExpandable = visibleCount > 0;
                    const isExpanded = queryState.expandedCheckId === check.check_id;
                    const showScopedRowsNote =
                        visibleCount < check.count && (visibleCount === 0 || isExpanded);
                    return (
                        <div key={check.check_id} className="glass-card">
                            <button
                                type="button"
                                data-testid={`dq-check-${check.check_id}`}
                                aria-expanded={isExpandable ? isExpanded : undefined}
                                aria-controls={
                                    isExpandable ? `dq-panel-${check.check_id}` : undefined
                                }
                                disabled={!isExpandable}
                                onClick={() =>
                                    updateExpandedCheck(isExpanded ? null : check.check_id)
                                }
                                className="w-full flex flex-col md:flex-row md:items-center gap-3 text-left disabled:cursor-default"
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {isExpandable ? (
                                        isExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                        )
                                    ) : (
                                        <span className="w-4 shrink-0" />
                                    )}
                                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                                        {check.check_id}
                                    </span>
                                    <span className="text-foreground font-semibold truncate">
                                        {t(`checks.${check.check_id}`, { defaultValue: check.title_cs })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs text-muted-foreground font-medium">
                                        {t(`areas.${dqAreaKey(check.area) ?? 'links'}`)}
                                    </span>
                                    <SeverityChip severity={check.severity} />
                                    <span
                                        data-testid={`dq-count-${check.check_id}`}
                                        className="text-sm font-bold text-foreground tabular-nums"
                                    >
                                        {check.count}
                                    </span>
                                    <StatusPill check={check} />
                                </div>
                            </button>
                            {/* S12 (FR-P5-5): the count badge is global, while
                                visible_count is RBAC-scoped. Keep that distinction
                                visible even when zero visible rows make the details
                                intentionally non-expandable. */}
                            {showScopedRowsNote ? (
                                <p
                                    data-testid={`dq-rows-scoped-${check.check_id}`}
                                    className="mt-3 text-muted-foreground text-xs italic"
                                >
                                    {t('rows_scoped', {
                                        shown: visibleCount,
                                        count: check.count,
                                    })}
                                </p>
                            ) : null}
                            {isExpandable ? (
                                <div
                                    id={`dq-panel-${check.check_id}`}
                                    data-testid={`dq-rows-${check.check_id}`}
                                    hidden={!isExpanded}
                                >
                                    {isExpanded ? (
                                        <ViolatingRows
                                            check={check}
                                            detail={details[check.check_id]}
                                            onRetry={() =>
                                                void fetchViolations(
                                                    check.check_id,
                                                    queryState.detailOffset
                                                )
                                            }
                                            onPage={(offset) =>
                                                updateExpandedCheck(check.check_id, offset)
                                            }
                                        />
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
                {!isLoading && visibleChecks.length === 0 && (
                    <div className="glass-card text-muted-foreground text-center py-8">{t('empty')}</div>
                )}
            </div>
        </PageContainer>
    );
}

export default IctRegisterDqPage;
