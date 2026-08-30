import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import { apiClient } from '@/services/apiClient';
import { logError } from '@/services/logger';
import type { ApprovalRequest } from '@/types/approval';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';
import { approvalsApi } from '@/services/approvalsApi';
import { useCollectionDataState } from '@/pages/shared/collectionPageState';

import { buildApprovalListParams, type ApprovalsFilter } from './approvalsPresentation';

type ApprovalDialogMode = 'approve' | 'reject' | null;

export function useApprovalsPageState() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const requestedApprovalId = Number(searchParams.get('approvalId'));
    const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
    const questionnaireCollection = useCollectionDataState<RiskQuestionnaireListItem>();
    const {
        applyFailure: applyQuestionnaireFailure,
        applySuccess: applyQuestionnaireSuccess,
        items: questionnaires,
        outcome: questionnairesOutcome,
        setIsLoading: setQuestionnairesLoading,
    } = questionnaireCollection;
    const [loading, setLoading] = useState(true);
    const [filter, setFilterState] = useState<ApprovalsFilter>(
        requestedTab === 'mine' || requestedTab === 'pending' || requestedTab === 'all'
            ? requestedTab
            : 'pending',
    );
    const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
    const [dialogMode, setDialogMode] = useState<ApprovalDialogMode>(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [cancelApprovalId, setCancelApprovalId] = useState<number | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const pendingQuestionnaireRetryRef = useRef(false);
    const latestQuestionnaireRequestRef = useRef(0);

    const fetchApprovals = useCallback(async () => {
        try {
            setLoading(true);
            const response = await approvalsApi.list(buildApprovalListParams(filter));
            setApprovals(response.items);
            setErrorKey(null);
        } catch (error) {
            logError('Failed to fetch approvals.', error);
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setLoading(false);
        }
    }, [filter]);

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
            return;
        }
        void fetchApprovals();
    }, [fetchApprovals, filter]);

    useEffect(() => {
        if (filter !== 'risk_assessment') {
            return;
        }
        void fetchQuestionnaires();
    }, [fetchQuestionnaires, filter]);

    useEffect(() => {
        if (!Number.isSafeInteger(requestedApprovalId) || requestedApprovalId <= 0) return;
        if (approvals.some((approval) => approval.id === requestedApprovalId)) {
            setExpandedRows((current) => new Set(current).add(requestedApprovalId));
        }
    }, [approvals, requestedApprovalId]);

    const setFilter = useCallback((nextFilter: ApprovalsFilter) => {
        setFilterState(nextFilter);
        const next = new URLSearchParams(searchParams);
        next.set('tab', nextFilter);
        next.delete('approvalId');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    const closeDialog = useCallback(() => {
        setSelectedApproval(null);
        setDialogMode(null);
        setResolutionNotes('');
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
        setExpandedRows((currentRows) => {
            const nextRows = new Set(currentRows);
            if (nextRows.has(id)) {
                nextRows.delete(id);
            } else {
                nextRows.add(id);
            }
            return nextRows;
        });
    }, []);

    const handleResolve = useCallback(async () => {
        if (isSubmitting || !selectedApproval || !dialogMode) {
            return;
        }
        if (!resolutionNotes.trim()) {
            setErrorKey('approvals:dialogs.resolution_required');
            return;
        }

        try {
            setIsSubmitting(true);
            if (dialogMode === 'approve') {
                await approvalsApi.approve(selectedApproval.id, { resolution_notes: resolutionNotes });
            } else {
                await approvalsApi.reject(selectedApproval.id, { resolution_notes: resolutionNotes });
            }
            void fetchApprovals();
            closeDialog();
        } catch (error: unknown) {
            logError('Failed to resolve request.', error);
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsSubmitting(false);
        }
    }, [closeDialog, dialogMode, fetchApprovals, isSubmitting, resolutionNotes, selectedApproval]);

    const requestCancel = useCallback((approvalId: number) => {
        setCancelApprovalId(approvalId);
    }, []);

    const dismissCancel = useCallback(() => {
        setCancelApprovalId(null);
    }, []);

    const confirmCancel = useCallback(async () => {
        if (cancelApprovalId === null) {
            return;
        }

        try {
            await approvalsApi.cancel(cancelApprovalId);
            void fetchApprovals();
        } catch (error) {
            logError('Failed to cancel request.', error);
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setCancelApprovalId(null);
        }
    }, [cancelApprovalId, fetchApprovals]);

    const refreshActiveView = useCallback(() => {
        if (filter === 'risk_assessment') {
            void fetchQuestionnaires();
            return;
        }
        void fetchApprovals();
    }, [fetchApprovals, fetchQuestionnaires, filter]);

    return {
        approvals,
        questionnaires,
        questionnairesOutcome,
        loading,
        filter,
        setFilter,
        selectedApproval,
        dialogMode,
        resolutionNotes,
        setResolutionNotes,
        isSubmitting,
        errorKey,
        cancelApprovalId,
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
