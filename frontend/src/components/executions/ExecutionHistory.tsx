import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Calendar,
    User,
    ChevronDown,
    ChevronUp,
    FileText,
    History,
    AlertTriangle,
    PlusCircle
} from 'lucide-react';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { controlApi } from '@/services/controlApi';
import type { ControlExecution } from '@/types/execution';
import type { Issue } from '@/types/issue';
import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue, formatDateValue } from '@/i18n/formatters';
import { getExecutionResultMeta } from '@/lib/executionResult';
import { logError } from '@/services/logger';
import {
    resolveCollectionOutcome,
    useCollectionDataState,
} from '@/pages/shared/collectionPageState';

interface ExecutionHistoryProps {
    controlId: number;
    controlName?: string;
    canCreateIssue?: boolean;
    createIssueLabel?: string;
    onIssueCreated?: (issue: Issue) => void;
    refreshKey?: number;
}

const EXECUTION_QUERY_PARAM = 'execution';

function parseExecutionId(values: string[]): number | null {
    if (values.length !== 1) {
        return null;
    }

    const parsed = Number(values[0]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function ExecutionHistory({
    controlId,
    controlName,
    canCreateIssue = false,
    createIssueLabel,
    onIssueCreated,
    refreshKey = 0,
}: ExecutionHistoryProps) {
    const { t, i18n } = useTranslation(['controls', 'common', 'issues']);
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const requestedExecutionValues = searchParams.getAll(EXECUTION_QUERY_PARAM);
    const expandedId = parseExecutionId(requestedExecutionValues);
    const needsExecutionNormalization = requestedExecutionValues.length > 0
        && (requestedExecutionValues.length !== 1
            || expandedId === null
            || requestedExecutionValues[0] !== String(expandedId));
    const queryIdentity = String(controlId);
    const collection = useCollectionDataState<ControlExecution>();
    const {
        applyFailure,
        applySuccess,
        beginQuery,
        commitQueryIdentity,
        forQuery,
        isLoading: collectionIsLoading,
        isQueryCurrent,
        setIsLoading,
    } = collection;
    useLayoutEffect(
        () => commitQueryIdentity(queryIdentity),
        [commitQueryIdentity, queryIdentity],
    );
    const queryState = forQuery(queryIdentity);
    const executions = queryState.items;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const outcome = resolveCollectionOutcome(queryState, isLoading);
    const [issueExecution, setIssueExecution] = useState<ControlExecution | null>(null);
    const latestRequestRef = useRef(0);
    const pendingRetryRef = useRef<string | null>(null);

    const updateExpandedId = useCallback((nextId: number | null, replace = false) => {
        const next = new URLSearchParams(serializedParams);
        if (nextId === null) {
            next.delete(EXECUTION_QUERY_PARAM);
        } else {
            next.set(EXECUTION_QUERY_PARAM, String(nextId));
        }
        setSearchParams(next, { replace });
    }, [serializedParams, setSearchParams]);

    useEffect(() => {
        if (needsExecutionNormalization) {
            updateExpandedId(expandedId, true);
        }
    }, [expandedId, needsExecutionNormalization, updateExpandedId]);

    useEffect(() => {
        const hasSuccessfulCollection = outcome.kind === 'content' || outcome.kind === 'empty';
        if (
            hasSuccessfulCollection
            && expandedId !== null
            && !executions.some((execution) => execution.id === expandedId)
        ) {
            updateExpandedId(null, true);
        }
    }, [executions, expandedId, outcome.kind, updateExpandedId]);

    const fetchExecutions = useCallback(async () => {
        const requestControlId = controlId;
        const requestQueryIdentity = queryIdentity;
        if (!isQueryCurrent(requestQueryIdentity)) {
            return;
        }
        const requestId = ++latestRequestRef.current;
        try {
            setIsLoading(true);
            const data = await controlApi.getExecutions(requestControlId);
            if (
                latestRequestRef.current !== requestId
                || !isQueryCurrent(requestQueryIdentity)
            ) {
                return;
            }
            applySuccess(requestQueryIdentity, {
                items: data,
                groups: [],
                capabilities: null,
                total: data.length,
            });
        } catch (err) {
            if (
                latestRequestRef.current === requestId
                && isQueryCurrent(requestQueryIdentity)
            ) {
                logError('Error fetching execution history:', err);
                applyFailure(err, { fallbackErrorKey: 'errors.load_history_failed' });
            }
        } finally {
            if (
                latestRequestRef.current === requestId
                && isQueryCurrent(requestQueryIdentity)
            ) {
                setIsLoading(false);
            }
        }
    }, [applyFailure, applySuccess, controlId, isQueryCurrent, queryIdentity, setIsLoading]);

    useEffect(() => {
        beginQuery(queryIdentity);
        void fetchExecutions();
    }, [beginQuery, fetchExecutions, queryIdentity, refreshKey]);

    useEffect(() => {
        setIssueExecution(null);
    }, [controlId]);

    const retryExecutions = useCallback(async () => {
        const retryQueryIdentity = queryIdentity;
        if (pendingRetryRef.current === retryQueryIdentity) {
            return;
        }
        pendingRetryRef.current = retryQueryIdentity;
        try {
            await fetchExecutions();
        } finally {
            if (pendingRetryRef.current === retryQueryIdentity) {
                pendingRetryRef.current = null;
            }
        }
    }, [fetchExecutions, queryIdentity]);

    if (outcome.kind === 'initial-loading') {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-3" role="status">
                <History className="h-8 w-8 animate-pulse text-slate-600" />
                <p className="text-sm font-medium">{t('loading.history', { ns: 'common' })}</p>
            </div>
        );
    }

    if (outcome.kind === 'denied') {
        return (
            <div role="alert" className="flex flex-col items-center justify-center p-12 text-rose-200 border-2 border-dashed border-rose-500/20 rounded-2xl gap-3">
                <AlertTriangle className="h-8 w-8 text-rose-400" />
                <p className="text-sm font-medium">{t('errors.history_access_denied', { ns: 'controls' })}</p>
            </div>
        );
    }

    let loadError: string | null = null;
    let isRetrying = false;
    if (outcome.kind === 'fatal-error') {
        loadError = t('errors.load_history_failed', { ns: 'controls' });
        isRetrying = outcome.isRetrying;
    } else if (outcome.kind === 'stale-with-error') {
        loadError = t('errors.history_stale', { ns: 'controls' });
        isRetrying = outcome.isRetrying;
    }
    const errorState = loadError ? (
        <div role="alert" className="flex items-center gap-3 p-4 text-rose-200 border border-rose-500/20 bg-rose-500/5 rounded-2xl">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <p className="text-sm font-medium">{loadError}</p>
            <button
                type="button"
                onClick={() => void retryExecutions()}
                aria-busy={isRetrying}
                aria-disabled={isRetrying}
                className="ml-auto px-4 py-2 rounded-xl border border-rose-400/20 bg-rose-400/10 text-xs font-black uppercase tracking-widest text-rose-100 hover:bg-rose-400/20 transition-colors"
            >
                {t('errors.try_again', { ns: 'controls' })}
            </button>
            {isRetrying ? <span role="status" className="sr-only">{t('status.history_retrying', { ns: 'controls' })}</span> : null}
        </div>
    ) : null;

    if (outcome.kind === 'fatal-error') {
        return (
            <div className="flex flex-col gap-3">
                {errorState}
            </div>
        );
    }

    if (outcome.kind === 'empty') {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-600 border-2 border-dashed border-white/5 rounded-2xl gap-2">
                <History className="h-8 w-8 opacity-20" />
                <p className="text-sm font-medium">{t('empty_state.no_executions', { ns: 'controls' })}</p>
                <p className="text-xs">{t('executions.log_to_start')}</p>
            </div>
        );
    }

    return (
        <>
            {errorState ? <div className="mb-4">{errorState}</div> : null}
            <div className="space-y-4">
                {executions.map((exe) => {
                    const config = getExecutionResultMeta(exe.result);
                    const isExpanded = expandedId === exe.id;
                    const ResultIcon = config.icon;
                    const canCreateExecutionIssue = canCreateIssue && (exe.result === 'failed' || exe.result === 'warning');

                    return (
                        <div
                            key={exe.id}
                            className={`glass-card !p-0 overflow-hidden border ${isExpanded ? 'border-border' : 'border-transparent'}`}
                        >
                            <div className="p-4 flex items-center gap-4">
                                <button
                                    type="button"
                                    aria-expanded={isExpanded}
                                    aria-controls={`execution-details-${exe.id}`}
                                    className="flex flex-1 min-w-0 items-center justify-between gap-4 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => updateExpandedId(isExpanded ? null : exe.id)}
                                >
                                    <span className="flex items-center gap-4 min-w-0">
                                        <span className={`p-2 rounded-lg border ${config.badgeClassName}`}>
                                            <ResultIcon className={`h-5 w-5 ${config.iconClassName}`} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-2 mb-0.5">
                                                <span className={`text-xs font-black uppercase tracking-widest ${config.iconClassName}`}>
                                                    {t(config.labelKey)}
                                                </span>
                                                <span className="text-slate-600">•</span>
                                                <span className="text-xs font-bold text-white">
                                                    {formatDateTimeValue(exe.executed_at, i18n.language)}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                                                <span className="flex items-center gap-1">
                                                    <User className="h-3 w-3" />
                                                    {exe.executed_by?.name || t('labels.unknown', { ns: 'common' })}
                                                </span>
                                                {exe.next_scheduled && (
                                                    <>
                                                        <span className="text-slate-700">|</span>
                                                        <span className="flex items-center gap-1 text-accent-text">
                                                            <Calendar className="h-3 w-3" />
                                                            {t('executions.next')}: {formatDateValue(exe.next_scheduled, i18n.language)}
                                                        </span>
                                                    </>
                                                )}
                                            </span>
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-4 min-w-0">
                                        {exe.findings && !isExpanded && (
                                            <span className="text-xs text-slate-400 line-clamp-1 max-w-[200px] hidden md:block italic">
                                                "{exe.findings}"
                                            </span>
                                        )}
                                        <span className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 transition-colors">
                                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                        </span>
                                    </span>
                                </button>
                                {canCreateExecutionIssue && (
                                    <button
                                        type="button"
                                        onClick={() => setIssueExecution(exe)}
                                        className="shrink-0 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-black uppercase tracking-widest text-foreground hover:border-accent/50 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <PlusCircle className="h-3 w-3" />
                                            {createIssueLabel ?? t('actions.new_issue', { ns: 'issues' })}
                                        </span>
                                    </button>
                                )}
                            </div>

                            {isExpanded && (
                                <div id={`execution-details-${exe.id}`} className="px-14 pb-5 pt-2 border-t border-white/5 bg-white/[0.01]">
                                    <div className="grid md:grid-cols-2 gap-8 mt-2">
                                        {exe.findings && (
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t('executions.findings_evidence')}</h4>
                                                <p className="text-sm text-slate-300 leading-relaxed font-medium">
                                                    {exe.findings}
                                                </p>
                                                {exe.evidence_reference && (
                                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10 w-fit mt-3">
                                                        <FileText className="h-3.5 w-3.5 text-accent" />
                                                        <span className="text-xs font-bold text-muted-foreground truncate max-w-[200px]">
                                                            {exe.evidence_reference}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {exe.notes && (
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t('executions.additional_notes')}</h4>
                                                <p className="text-sm text-slate-400 leading-relaxed italic">
                                                    {exe.notes}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {issueExecution?.control_id === controlId && (
                <IssueQuickCreateModal
                    isOpen
                    onClose={() => setIssueExecution(null)}
                    contextEntityType="execution"
                    contextEntityId={issueExecution.id}
                    contextEntityLabel={controlName ?? formatDateTimeValue(issueExecution.executed_at, i18n.language)}
                    onCreated={(issue) => {
                        onIssueCreated?.(issue);
                        setIssueExecution(null);
                    }}
                />
            )}
        </>
    );
}
