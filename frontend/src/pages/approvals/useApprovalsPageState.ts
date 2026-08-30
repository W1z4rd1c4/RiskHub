import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import { apiClient, ApiClientError } from '@/services/apiClient';
import { logError } from '@/services/logger';
import type { ApprovalRequest } from '@/types/approval';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';
import { approvalsApi } from '@/services/approvalsApi';
import { useCollectionDataState } from '@/pages/shared/collectionPageState';

import {
    buildApprovalPageParams,
    APPROVAL_PAGE_SIZE,
    parseApprovalWorkbenchQuery,
    updateApprovalWorkbenchQuery,
    type ApprovalWorkbenchTab,
} from './approvalWorkbenchQuery';

type ApprovalDialogMode = 'approve' | 'reject' | null;

type LinkedApprovalState =
    | { kind: 'idle' }
    | { kind: 'loading'; approvalId: number }
    | { kind: 'content'; approvalId: number; approval: ApprovalRequest }
    | { kind: 'unavailable'; approvalId: number }
    | { kind: 'error'; approvalId: number };

type CachedLinkedApprovalState = Extract<
    LinkedApprovalState,
    { kind: 'content' | 'unavailable' }
>;

interface ApprovalQueueError {
    queryIdentity: string;
    key: string;
}

function approvalQueueIdentity(state: { tab: ApprovalWorkbenchTab; query: string; page: number }): string {
    return `${state.tab}\u0000${state.query}\u0000${state.page}`;
}

function isUnavailableApprovalError(error: unknown): boolean {
    return error instanceof ApiClientError && (error.status === 403 || error.status === 404);
}

export function useApprovalsPageState() {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedSearchParams = searchParams.toString();
    const parsedQuery = useMemo(
        () => parseApprovalWorkbenchQuery(new URLSearchParams(serializedSearchParams)),
        [serializedSearchParams],
    );
    const { tab: filter, query, page, approvalId: requestedApprovalId } = parsedQuery.state;
    const [searchInput, setSearchInput] = useState(query);
    const approvalQueueState = useMemo(
        () => ({ tab: filter, query, page }),
        [filter, page, query],
    );
    const approvalPopulationIdentity = `${filter}\u0000${query}`;
    const approvalQueryIdentity = approvalQueueIdentity(approvalQueueState);
    const [approvalPage, setApprovalPage] = useState<{
        populationIdentity: string;
        queryIdentity: string;
        items: ApprovalRequest[];
        total: number;
        skip: number;
        limit: number;
        skippedCorruptPayloads: number;
    } | null>(null);
    const questionnaireCollection = useCollectionDataState<RiskQuestionnaireListItem>();
    const {
        applyFailure: applyQuestionnaireFailure,
        applySuccess: applyQuestionnaireSuccess,
        items: questionnaires,
        outcome: questionnairesOutcome,
        setIsLoading: setQuestionnairesLoading,
    } = questionnaireCollection;
    const currentApprovalPage = approvalPage?.queryIdentity === approvalQueryIdentity
        ? approvalPage
        : null;
    const approvals = currentApprovalPage?.items ?? [];
    const approvalTotal = currentApprovalPage?.total ?? 0;
    const approvalSkip = currentApprovalPage?.skip ?? (page - 1) * APPROVAL_PAGE_SIZE;
    const approvalLimit = currentApprovalPage?.limit ?? APPROVAL_PAGE_SIZE;
    const skippedCorruptPayloads = currentApprovalPage?.skippedCorruptPayloads ?? 0;
    const [approvalLoading, setApprovalLoading] = useState(filter !== 'risk_assessment');
    const [approvalRefreshGeneration, setApprovalRefreshGeneration] = useState(0);
    const [pendingPageNormalization, setPendingPageNormalization] = useState<{
        queryIdentity: string;
        page: number;
    } | null>(null);
    const [settledApprovalQueryIdentity, setSettledApprovalQueryIdentity] = useState<string | null>(null);
    const approvalPageAvailable = currentApprovalPage !== null;
    const loading = filter !== 'risk_assessment'
        && (
            approvalLoading
            || (!approvalPageAvailable && settledApprovalQueryIdentity !== approvalQueryIdentity)
        );
    const approvalPaginationAvailable = approvalPageAvailable
        || (
            loading
            && approvalPage?.populationIdentity === approvalPopulationIdentity
        );
    const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
    const [dialogMode, setDialogMode] = useState<ApprovalDialogMode>(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [approvalQueueError, setApprovalQueueError] = useState<ApprovalQueueError | null>(null);
    const [resolutionErrorKey, setResolutionErrorKey] = useState<string | null>(null);
    const [cancelApprovalId, setCancelApprovalId] = useState<number | null>(null);
    const [cancelErrorKey, setCancelErrorKey] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const expandedRows = useMemo(
        () => requestedApprovalId === null
            ? new Set<number>()
            : new Set([requestedApprovalId]),
        [requestedApprovalId],
    );
    const pendingQuestionnaireRetryRef = useRef(false);
    const latestQuestionnaireRequestRef = useRef(0);
    const latestApprovalRequestRef = useRef(0);
    const latestLinkedApprovalRequestRef = useRef(0);
    const committedSearchParamsRef = useRef(location.search);
    const activeApprovalQueryIdentityRef = useRef(approvalQueryIdentity);
    const linkedApprovalCacheRef = useRef(new Map<number, CachedLinkedApprovalState>());
    const [linkedApprovalState, setLinkedApprovalState] = useState<LinkedApprovalState>({ kind: 'idle' });
    const [linkedApprovalRetryGeneration, setLinkedApprovalRetryGeneration] = useState(0);
    const approvalQueueErrorKey = approvalQueueError?.queryIdentity === approvalQueryIdentity
        ? approvalQueueError.key
        : null;

    useLayoutEffect(() => {
        committedSearchParamsRef.current = location.search;
        activeApprovalQueryIdentityRef.current = approvalQueryIdentity;
    }, [approvalQueryIdentity, location.search]);

    useEffect(() => {
        if (searchInput.trim() !== query) {
            setSearchInput(query);
        }
    }, [query, searchInput]);

    const fetchApprovals = useCallback(async () => {
        const requestId = ++latestApprovalRequestRef.current;
        try {
            setApprovalLoading(true);
            setApprovalQueueError(null);
            const response = await approvalsApi.list(buildApprovalPageParams(approvalQueueState));
            if (latestApprovalRequestRef.current !== requestId) {
                return;
            }
            const lastPage = Math.max(
                1,
                Math.ceil(response.total / Math.max(1, response.limit)),
            );
            if (page > lastPage) {
                setPendingPageNormalization({
                    queryIdentity: approvalQueryIdentity,
                    page: lastPage,
                });
                return;
            }
            setApprovalPage({
                populationIdentity: approvalPopulationIdentity,
                queryIdentity: approvalQueryIdentity,
                items: response.items,
                total: response.total,
                skip: response.skip,
                limit: response.limit,
                skippedCorruptPayloads: response.skipped_corrupt_payloads,
            });
            setSettledApprovalQueryIdentity(approvalQueryIdentity);
        } catch (error) {
            if (latestApprovalRequestRef.current !== requestId) {
                return;
            }
            logError('Failed to fetch approvals.', error);
            setApprovalQueueError({
                queryIdentity: approvalQueryIdentity,
                key: apiClient.toUiMessageKey(error),
            });
            setSettledApprovalQueryIdentity(approvalQueryIdentity);
        } finally {
            if (latestApprovalRequestRef.current === requestId) {
                setApprovalLoading(false);
            }
        }
    }, [
        approvalQueryIdentity,
        approvalPopulationIdentity,
        approvalQueueState,
        page,
    ]);

    const fetchQuestionnaires = useCallback(async () => {
        const requestId = ++latestQuestionnaireRequestRef.current;
        try {
            setQuestionnairesLoading(true);
            const items = await riskQuestionnairesApi.inbox();
            if (latestQuestionnaireRequestRef.current !== requestId) {
                return;
            }
            applyQuestionnaireSuccess({
                items,
                groups: [],
                capabilities: null,
                total: items.length,
            });
        } catch (error) {
            if (latestQuestionnaireRequestRef.current !== requestId) {
                return;
            }
            logError('Failed to fetch questionnaire inbox.', error);
            applyQuestionnaireFailure(error, {
                fallbackErrorKey: 'errors.questionnaire_load_failed',
            });
        } finally {
            if (latestQuestionnaireRequestRef.current === requestId) {
                setQuestionnairesLoading(false);
            }
        }
    }, [
        applyQuestionnaireFailure,
        applyQuestionnaireSuccess,
        setQuestionnairesLoading,
    ]);

    const retryQuestionnaires = useCallback(async () => {
        if (pendingQuestionnaireRetryRef.current) {
            return;
        }
        pendingQuestionnaireRetryRef.current = true;
        try {
            await fetchQuestionnaires();
        } finally {
            pendingQuestionnaireRetryRef.current = false;
        }
    }, [fetchQuestionnaires]);

    useEffect(() => {
        if (filter === 'risk_assessment') {
            latestApprovalRequestRef.current += 1;
            setApprovalLoading(false);
            setApprovalQueueError(null);
            return;
        }
        void fetchApprovals();
    }, [approvalRefreshGeneration, fetchApprovals, filter]);

    useEffect(() => {
        if (!parsedQuery.needsNormalization) {
            return;
        }
        setSearchParams(parsedQuery.normalizedParams, { replace: true });
    }, [parsedQuery, setSearchParams]);

    useEffect(() => {
        if (!pendingPageNormalization) {
            return;
        }
        if (activeApprovalQueryIdentityRef.current !== pendingPageNormalization.queryIdentity) {
            setPendingPageNormalization(null);
            return;
        }
        setSearchParams(() => {
            const currentParams = new URLSearchParams(committedSearchParamsRef.current);
            const current = parseApprovalWorkbenchQuery(currentParams).state;
            const currentIdentity = approvalQueueIdentity(current);
            if (currentIdentity !== pendingPageNormalization.queryIdentity) {
                return currentParams;
            }
            return updateApprovalWorkbenchQuery(currentParams, {
                page: pendingPageNormalization.page,
            });
        }, { replace: true });
        setPendingPageNormalization(null);
    }, [pendingPageNormalization, setSearchParams]);

    useEffect(() => {
        if (filter !== 'risk_assessment') {
            return;
        }
        void fetchQuestionnaires();
    }, [fetchQuestionnaires, filter]);

    const selectedApprovalIsOnPage = requestedApprovalId !== null
        && approvals.some((approval) => approval.id === requestedApprovalId);

    useEffect(() => {
        if (requestedApprovalId === null || selectedApprovalIsOnPage) {
            latestLinkedApprovalRequestRef.current += 1;
            setLinkedApprovalState({ kind: 'idle' });
            return;
        }
        const cached = linkedApprovalCacheRef.current.get(requestedApprovalId);
        if (cached) {
            setLinkedApprovalState(cached);
            return;
        }

        const requestId = ++latestLinkedApprovalRequestRef.current;
        setLinkedApprovalState({ kind: 'loading', approvalId: requestedApprovalId });
        void approvalsApi.get(requestedApprovalId).then((approval) => {
            if (latestLinkedApprovalRequestRef.current !== requestId) {
                return;
            }
            const content: CachedLinkedApprovalState = {
                kind: 'content',
                approvalId: requestedApprovalId,
                approval,
            };
            linkedApprovalCacheRef.current.set(requestedApprovalId, content);
            setLinkedApprovalState(content);
        }).catch((error: unknown) => {
            if (latestLinkedApprovalRequestRef.current !== requestId) {
                return;
            }
            if (isUnavailableApprovalError(error)) {
                const unavailable: CachedLinkedApprovalState = {
                    kind: 'unavailable',
                    approvalId: requestedApprovalId,
                };
                linkedApprovalCacheRef.current.set(requestedApprovalId, unavailable);
                setLinkedApprovalState(unavailable);
                return;
            }
            logError('Failed to fetch linked approval request.', error);
            setLinkedApprovalState({ kind: 'error', approvalId: requestedApprovalId });
        });

        return () => {
            if (latestLinkedApprovalRequestRef.current === requestId) {
                latestLinkedApprovalRequestRef.current += 1;
            }
        };
    }, [
        linkedApprovalRetryGeneration,
        requestedApprovalId,
        selectedApprovalIsOnPage,
    ]);

    const visibleLinkedApprovalState = requestedApprovalId !== null
        && !selectedApprovalIsOnPage
        && 'approvalId' in linkedApprovalState
        && linkedApprovalState.approvalId === requestedApprovalId
        ? linkedApprovalState
        : { kind: 'idle' } as const;

    const retryLinkedApproval = useCallback(() => {
        setLinkedApprovalRetryGeneration((generation) => generation + 1);
    }, []);

    const reconcileResolvedApproval = useCallback((approvalId: number) => {
        linkedApprovalCacheRef.current.delete(approvalId);
        latestLinkedApprovalRequestRef.current += 1;
        setLinkedApprovalState((current) => (
            'approvalId' in current && current.approvalId === approvalId
                ? { kind: 'idle' }
                : current
        ));
        setSearchParams(() => {
            const currentParams = new URLSearchParams(committedSearchParamsRef.current);
            if (parseApprovalWorkbenchQuery(currentParams).state.approvalId !== approvalId) {
                return currentParams;
            }
            return updateApprovalWorkbenchQuery(currentParams, { approvalId: null });
        }, { replace: true });
    }, [setSearchParams]);

    const refreshApprovals = useCallback(() => {
        setApprovalRefreshGeneration((generation) => generation + 1);
    }, []);

    const setFilter = useCallback((nextFilter: ApprovalWorkbenchTab) => {
        const nextParams = updateApprovalWorkbenchQuery(
            new URLSearchParams(serializedSearchParams),
            { tab: nextFilter },
        );
        activeApprovalQueryIdentityRef.current = approvalQueueIdentity(
            parseApprovalWorkbenchQuery(nextParams).state,
        );
        setSearchParams(nextParams);
    }, [serializedSearchParams, setSearchParams]);

    const setQuery = useCallback((nextQuery: string) => {
        setSearchInput(nextQuery);
        const nextParams = updateApprovalWorkbenchQuery(
            new URLSearchParams(serializedSearchParams),
            { query: nextQuery },
        );
        activeApprovalQueryIdentityRef.current = approvalQueueIdentity(
            parseApprovalWorkbenchQuery(nextParams).state,
        );
        setSearchParams(nextParams, { replace: true });
    }, [serializedSearchParams, setSearchParams]);

    const setPage = useCallback((nextPage: number) => {
        const nextParams = updateApprovalWorkbenchQuery(
            new URLSearchParams(serializedSearchParams),
            { page: nextPage },
        );
        activeApprovalQueryIdentityRef.current = approvalQueueIdentity(
            parseApprovalWorkbenchQuery(nextParams).state,
        );
        setSearchParams(nextParams);
    }, [serializedSearchParams, setSearchParams]);

    const closeDialog = useCallback(() => {
        setSelectedApproval(null);
        setDialogMode(null);
        setResolutionNotes('');
        setResolutionErrorKey(null);
    }, []);

    const openApproveDialog = useCallback((approval: ApprovalRequest) => {
        setSelectedApproval(approval);
        setDialogMode('approve');
    }, []);

    const openRejectDialog = useCallback((approval: ApprovalRequest) => {
        setSelectedApproval(approval);
        setDialogMode('reject');
    }, []);

    const toggleRow = useCallback((id: number) => {
        setSearchParams(
            updateApprovalWorkbenchQuery(
                new URLSearchParams(serializedSearchParams),
                { approvalId: requestedApprovalId === id ? null : id },
            ),
        );
    }, [requestedApprovalId, serializedSearchParams, setSearchParams]);

    const handleResolve = useCallback(async () => {
        if (isSubmitting || !selectedApproval || !dialogMode) {
            return;
        }
        if (!resolutionNotes.trim()) {
            setResolutionErrorKey('approvals:dialogs.resolution_required');
            return;
        }

        try {
            setIsSubmitting(true);
            setResolutionErrorKey(null);
            if (dialogMode === 'approve') {
                await approvalsApi.approve(selectedApproval.id, { resolution_notes: resolutionNotes });
            } else {
                await approvalsApi.reject(selectedApproval.id, { resolution_notes: resolutionNotes });
            }
            reconcileResolvedApproval(selectedApproval.id);
            refreshApprovals();
            closeDialog();
        } catch (error: unknown) {
            logError('Failed to resolve request.', error);
            setResolutionErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsSubmitting(false);
        }
    }, [
        closeDialog,
        dialogMode,
        isSubmitting,
        reconcileResolvedApproval,
        refreshApprovals,
        resolutionNotes,
        selectedApproval,
    ]);

    const requestCancel = useCallback((approvalId: number) => {
        setCancelErrorKey(null);
        setCancelApprovalId(approvalId);
    }, []);

    const dismissCancel = useCallback(() => {
        setCancelErrorKey(null);
        setCancelApprovalId(null);
    }, []);

    const confirmCancel = useCallback(async () => {
        if (cancelApprovalId === null || isCancelling) {
            return;
        }

        try {
            setIsCancelling(true);
            setCancelErrorKey(null);
            await approvalsApi.cancel(cancelApprovalId);
            reconcileResolvedApproval(cancelApprovalId);
            refreshApprovals();
            setCancelApprovalId(null);
        } catch (error) {
            logError('Failed to cancel request.', error);
            setCancelErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsCancelling(false);
        }
    }, [cancelApprovalId, isCancelling, reconcileResolvedApproval, refreshApprovals]);

    const refreshActiveView = useCallback(() => {
        if (filter === 'risk_assessment') {
            void fetchQuestionnaires();
            return;
        }
        refreshApprovals();
    }, [fetchQuestionnaires, filter, refreshApprovals]);

    return {
        approvals,
        approvalTotal,
        approvalSkip,
        approvalLimit,
        approvalPageAvailable,
        approvalPaginationAvailable,
        skippedCorruptPayloads,
        linkedApprovalState: visibleLinkedApprovalState,
        retryLinkedApproval,
        questionnaires,
        questionnairesOutcome,
        loading,
        filter,
        query: searchInput,
        page,
        setFilter,
        setQuery,
        setPage,
        selectedApproval,
        dialogMode,
        resolutionNotes,
        setResolutionNotes,
        isSubmitting,
        approvalQueueErrorKey,
        resolutionErrorKey,
        cancelApprovalId,
        cancelErrorKey,
        isCancelling,
        expandedRows,
        openApproveDialog,
        openRejectDialog,
        closeDialog,
        toggleRow,
        handleResolve,
        requestCancel,
        dismissCancel,
        confirmCancel,
        refreshActiveView,
        retryQuestionnaires,
    };
}
