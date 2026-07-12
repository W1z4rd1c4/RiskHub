import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, RefreshCw } from 'lucide-react';

import { TableErrorState, useTableErrorContract } from '@/components/tables/tableError';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { apiClient, isForbiddenApiError } from '@/services/apiClient';
import { ictRegisterDqApi } from '@/services/ictRegisterDqApi';
import type { IctDqCheck, IctRegisterDq } from '@/types/ictRegisterDq';

import {
    type DqStatusFilter,
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

function StatusPill({ check }: { check: IctDqCheck }) {
    const { t } = useTranslation('ictRegisterDq');
    if (isFinding(check)) {
        return (
            <span
                data-testid={`dq-status-${check.check_id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400"
            >
                <AlertCircle className="h-3.5 w-3.5" />
                {t('status.finding')}
            </span>
        );
    }
    if (isProductionInert(check)) {
        // A quiet check with no app column feeding it (DQ-23): muted "not
        // yet measurable", never a false OK.
        return (
            <span
                data-testid={`dq-status-${check.check_id}`}
                title={t('status.not_measurable_hint')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-white/5 text-slate-400"
            >
                <CircleDashed className="h-3.5 w-3.5" />
                {t('status.not_measurable')}
            </span>
        );
    }
    return (
        <span
            data-testid={`dq-status-${check.check_id}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400"
        >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('status.ok')}
        </span>
    );
}

function SeverityChip({ severity }: { severity: string }) {
    const { t } = useTranslation('ictRegisterDq');
    const key = dqSeverityKey(severity);
    const tone =
        key === 'critical'
            ? 'bg-red-500/10 text-red-400'
            : key === 'high'
              ? 'bg-amber-500/10 text-amber-400'
              : 'bg-sky-500/10 text-sky-400';
    return (
        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${tone}`}>
            {key ? t(`severity.${key}`) : severity}
        </span>
    );
}

function ViolatingRows({ check }: { check: IctDqCheck }) {
    const { t } = useTranslation('ictRegisterDq');
    // S12 (FR-P5-5): the count badge is the global total, but `violating_rows`
    // may be RBAC-scoped to fewer rows — say "N of M shown" so the shorter list
    // never reads as a mismatch with the count.
    const shown = check.violating_rows.length;
    const isScoped = shown < check.count;
    return (
        <div
            data-testid={`dq-rows-${check.check_id}`}
            className="mt-3 border-t border-white/10 pt-3 space-y-1.5"
        >
            {isScoped ? (
                <p
                    data-testid={`dq-rows-scoped-${check.check_id}`}
                    className="text-slate-500 text-xs italic"
                >
                    {t('rows_scoped', { shown, count: check.count })}
                </p>
            ) : null}
            {check.violating_rows.map((row, index) => {
                const path = violatingRowPath(row);
                const label = (
                    <>
                        <span className="text-slate-500 text-xs uppercase tracking-wide mr-2">
                            {t(`entities.${row.entity_type}`, { defaultValue: row.entity_type })}
                        </span>
                        {localizeRegisterRowLabel(row.label, t)}
                    </>
                );
                return (
                    <div key={`${row.entity_type}-${row.entity_id}-${index}`} className="text-sm">
                        {path ? (
                            <Link
                                to={path}
                                className="text-slate-300 hover:text-accent transition-colors underline decoration-white/20 hover:decoration-accent"
                            >
                                {label}
                            </Link>
                        ) : (
                            <span className="text-slate-300">{label}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export function IctRegisterDqPage() {
    const { t } = useTranslation('ictRegisterDq');
    // Committee drill-down deep links (#51): ?check= pre-expands the
    // producing check; ?status=findings pre-applies the findings filter.
    const [searchParams] = useSearchParams();
    const [initialQueryState] = useState(() => parseDqPageQueryParams(searchParams));
    const [data, setData] = useState<IctRegisterDq | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [statusFilter, setStatusFilter] = useState<DqStatusFilter>(initialQueryState.statusFilter);
    const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
        initialQueryState.expandedCheckId ? { [initialQueryState.expandedCheckId]: true } : {}
    );

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

    // FR-P3-4 (N17 / C3 / C4): the DQ screen does not consume SortableTable, so it
    // drives the shared table-error contract directly. `hasData` decides whether a
    // failed fetch replaces the screen (first load) or overlays a retry banner above
    // the last-good summary — a dropped request is never a false 0/0/0.
    const hasData = data !== null;
    const errorContract = useTableErrorContract({ isError: errorKey !== null, hasData });

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    // Explicit aria-busy loading branch — only while there is nothing to show yet.
    // A refetch over existing data keeps the (stale) summary and spins the refresh
    // button instead of flashing 0/0/0 during load (C3).
    if (isLoading && !hasData) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-4 py-24"
                aria-busy="true"
                data-loading="true"
                data-testid="dq-loading"
            >
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">
                    {t('loading')}
                </p>
            </div>
        );
    }

    // Failed first load with no last-good data → replace the screen with the shared
    // localized error + retry, never an empty/zero state (C4, N17).
    if (errorContract.showErrorBlock) {
        return (
            <TableErrorState
                onRetry={() => void fetchDq()}
                isRetrying={isLoading}
                testId="dq-error"
            />
        );
    }

    const checks = data?.checks ?? [];
    const summary = summarizeChecks(checks);
    const visibleChecks = filterChecks(checks, statusFilter);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                    <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => void fetchDq()}
                    data-testid="dq-refresh-button"
                    className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    {t('actions.refresh')}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card">
                    <p className="text-slate-500 text-sm font-medium">{t('summary.checks')}</p>
                    <p data-testid="dq-summary-total" className="text-3xl font-bold text-white mt-1">
                        {summary.total}
                    </p>
                </div>
                <div className="glass-card">
                    <p className="text-slate-500 text-sm font-medium">{t('summary.findings')}</p>
                    <p data-testid="dq-summary-findings" className="text-3xl font-bold text-red-400 mt-1">
                        {summary.findings}
                    </p>
                </div>
                <div className="glass-card">
                    <p className="text-slate-500 text-sm font-medium">{t('summary.ok')}</p>
                    <p data-testid="dq-summary-ok" className="text-3xl font-bold text-emerald-400 mt-1">
                        {summary.ok}
                    </p>
                </div>
            </div>

            {/* S10 (FR-P5-5): a positive all-clear when the register has checks but
                zero findings — never a bare "0" that reads like missing data. */}
            {summary.total > 0 && summary.findings === 0 ? (
                <div
                    data-testid="dq-all-clear"
                    className="glass-card flex items-center gap-3 border border-emerald-500/20 bg-emerald-500/5"
                >
                    <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" aria-hidden="true" />
                    <div>
                        <p className="text-emerald-400 font-bold">{t('all_clear.title')}</p>
                        <p className="text-slate-400 text-sm">
                            {t('all_clear.body', { count: summary.total })}
                        </p>
                    </div>
                </div>
            ) : null}

            <div className="glass-card flex flex-col md:flex-row md:items-center gap-4">
                <p className="text-slate-500 text-sm font-medium flex-1">{t('filters.label')}</p>
                <ThemedSelect
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as DqStatusFilter)}
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
                    const isExpandable = check.violating_rows.length > 0;
                    const isExpanded = Boolean(expanded[check.check_id]);
                    return (
                        <div key={check.check_id} className="glass-card">
                            <button
                                type="button"
                                data-testid={`dq-check-${check.check_id}`}
                                disabled={!isExpandable}
                                onClick={() =>
                                    setExpanded((current) => ({
                                        ...current,
                                        [check.check_id]: !current[check.check_id],
                                    }))
                                }
                                className="w-full flex flex-col md:flex-row md:items-center gap-3 text-left disabled:cursor-default"
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {isExpandable ? (
                                        isExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                                        )
                                    ) : (
                                        <span className="w-4 shrink-0" />
                                    )}
                                    <span className="font-mono text-xs text-slate-500 shrink-0">
                                        {check.check_id}
                                    </span>
                                    <span className="text-white font-semibold truncate">
                                        {t(`checks.${check.check_id}`, { defaultValue: check.title_cs })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs text-slate-500 font-medium">
                                        {t(`areas.${dqAreaKey(check.area) ?? 'links'}`)}
                                    </span>
                                    <SeverityChip severity={check.severity} />
                                    <span
                                        data-testid={`dq-count-${check.check_id}`}
                                        className="text-sm font-bold text-slate-300 tabular-nums"
                                    >
                                        {check.count}
                                    </span>
                                    <StatusPill check={check} />
                                </div>
                            </button>
                            {isExpanded && isExpandable && <ViolatingRows check={check} />}
                        </div>
                    );
                })}
                {!isLoading && visibleChecks.length === 0 && (
                    <div className="glass-card text-slate-500 text-center py-8">{t('empty')}</div>
                )}
            </div>
        </div>
    );
}

export default IctRegisterDqPage;
