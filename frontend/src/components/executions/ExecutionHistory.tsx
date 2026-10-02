import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Calendar,
    User,
    ChevronDown,
    ChevronUp,
    FileText,
    History,
    PlusCircle
} from 'lucide-react';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { controlApi } from '@/services/controlApi';
import type { ControlExecution } from '@/types/execution';
import type { Issue } from '@/types/issue';
import { Button } from '@/components/ui/button';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { getExecutionResultMeta } from '@/lib/executionResult';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { logError } from '@/services/logger';
import { isAbortError } from '@/services/api/requestRuntime';
import { ApiClientError } from '@/services/apiClient';
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

function isProtectedUnavailableError(error: unknown): boolean {
    return error instanceof ApiClientError && (error.status === 403 || error.status === 404);
}

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
    const { t } = useTranslation(['controls', 'common', 'issues']);
    const format = useFormat();
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
    const requestControllerRef = useRef<AbortController | null>(null);
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
        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;
        try {
            setIsLoading(true);
            const data = await controlApi.getExecutions(requestControlId, { signal: controller.signal });
            if (
                controller.signal.aborted
                || latestRequestRef.current !== requestId
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
                !isAbortError(err)
                && !controller.signal.aborted
                && latestRequestRef.current === requestId
                && isQueryCurrent(requestQueryIdentity)
            ) {
                logError('Error fetching execution history:', err);
                applyFailure(err, {
                    fallbackErrorKey: 'errors.load_history_failed',
                    isAccessDenied: isProtectedUnavailableError,
                });
            }
        } finally {
            if (
                !controller.signal.aborted
                && latestRequestRef.current === requestId
                && isQueryCurrent(requestQueryIdentity)
            ) {
                setIsLoading(false);
            }
        }
    }, [applyFailure, applySuccess, controlId, isQueryCurrent, queryIdentity, setIsLoading]);

    useEffect(() => {
        beginQuery(queryIdentity);
        void fetchExecutions();
        return () => requestControllerRef.current?.abort();
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
        return <LoadingState layout="section" label={t('loading.history', { ns: 'common' })} />;
    }

    if (outcome.kind === 'denied') {
        // A refresh can be denied after rows were shown, so the replacement is announced.
        return <AccessDeniedState layout="section" descriptionKey="errors.history_access_denied" ns="controls" live />;
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
        <>
            <ErrorState
                layout="section"
                variant={outcome.kind === 'stale-with-error' ? 'banner' : 'block'}
                message={loadError}
                onRetry={() => void retryExecutions()}
                retryLabel={t('errors.try_again', { ns: 'controls' })}
                isRetrying={isRetrying}
            />
            {isRetrying ? <span role="status" className="sr-only">{t('status.history_retrying', { ns: 'controls' })}</span> : null}
        </>
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
            <EmptyState
                layout="section"
                icon={History}
                title={t('empty_state.no_executions', { ns: 'controls' })}
                description={t('executions.log_to_start')}
            />
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
                                <Button
                                    variant="ghost"
                                    aria-expanded={isExpanded}
                                    aria-controls={`execution-details-${exe.id}`}
                                    // The row keeps its own icon sizes (`!size-*`) over the Button's 16px default.
                                    className="h-auto min-w-0 flex-1 justify-between gap-4 whitespace-normal p-0 text-left font-normal hover:bg-transparent"
                                    onClick={() => updateExpandedId(isExpanded ? null : exe.id)}
                                >
                                    <span className="flex items-center gap-4 min-w-0">
                                        <span className={`p-2 rounded-lg border ${config.badgeClassName}`}>
                                            <ResultIcon aria-hidden="true" className={`!size-5 ${config.iconClassName}`} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-2 mb-0.5">
                                                <span className={`text-xs font-bold uppercase tracking-wide ${config.iconClassName}`}>
                                                    {t(config.labelKey)}
                                                </span>
                                                <span className="text-muted-foreground">•</span>
                                                <span className="text-xs font-bold text-foreground">
                                                    {format.dateTime(exe.executed_at)}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                                                <span className="flex items-center gap-1">
                                                    <User aria-hidden="true" className="!size-3" />
                                                    {exe.executed_by?.name || t('labels.unknown', { ns: 'common' })}
                                                </span>
                                                {exe.next_scheduled && (
                                                    <>
                                                        <span className="text-muted-foreground">|</span>
                                                        <span className="flex items-center gap-1 text-accent-text">
                                                            <Calendar aria-hidden="true" className="!size-3" />
                                                            {t('executions.next')}: {format.date(exe.next_scheduled)}
                                                        </span>
                                                    </>
                                                )}
                                            </span>
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-4 min-w-0">
                                        {exe.findings && !isExpanded && (
                                            <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px] hidden md:block italic">
                                                "{exe.findings}"
                                            </span>
                                        )}
                                        <span className="p-1.5 rounded-lg text-muted-foreground">
                                            {isExpanded ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
                                        </span>
                                    </span>
                                </Button>
                                {canCreateExecutionIssue && (
                                    <Button
                                        variant="outline"
                                        size="compact"
                                        onClick={() => setIssueExecution(exe)}
                                        className="shrink-0"
                                    >
                                        <PlusCircle aria-hidden="true" />
                                        {createIssueLabel ?? t('actions.new_issue', { ns: 'issues' })}
                                    </Button>
                                )}
                            </div>

                            {isExpanded && (
                                <div id={`execution-details-${exe.id}`} className="px-14 pb-5 pt-2 border-t border-border bg-tint/[0.03]">
                                    <div className="grid md:grid-cols-2 gap-8 mt-2">
                                        {exe.findings && (
                                            <div className="space-y-2">
                                                <h4 className="text-eyebrow">{t('executions.findings_evidence')}</h4>
                                                <p className="text-sm text-foreground leading-relaxed font-medium">
                                                    {exe.findings}
                                                </p>
                                                {exe.evidence_reference && (
                                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-tint/5 border border-border w-fit mt-3">
                                                        <FileText aria-hidden="true" className="h-3.5 w-3.5 text-accent-text" />
                                                        <span className="text-xs font-bold text-muted-foreground truncate max-w-[200px]">
                                                            {exe.evidence_reference}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {exe.notes && (
                                            <div className="space-y-2">
                                                <h4 className="text-eyebrow">{t('executions.additional_notes')}</h4>
                                                <p className="text-sm text-muted-foreground leading-relaxed italic">
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
                    contextEntityLabel={controlName ?? format.dateTime(issueExecution.executed_at)}
                    onCreated={(issue) => {
                        onIssueCreated?.(issue);
                        setIssueExecution(null);
                    }}
                />
            )}
        </>
    );
}
