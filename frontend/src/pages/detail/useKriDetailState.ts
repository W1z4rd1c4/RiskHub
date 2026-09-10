import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { KRIModalSaveResult } from '@/components/kri/KRIModal';
import { useTranslation } from '@/i18n/hooks';
import { parseUpdateResult } from '@/lib/approvalUi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { ApiClientError, apiClient } from '@/services/apiClient';
import { kriApi } from '@/services/kriApi';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
import type { KeyRiskIndicator, KRIHistoryCapabilities, KRIHistoryEntry } from '@/types/kri';
import type { Risk } from '@/types/risk';

import { useDetailQuery } from './useDetailQuery';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { useCollectionDataState } from '@/pages/shared/collectionPageState';
import { isAbortError } from '@/services/api/requestRuntime';

export type KriDetailTabView = 'overview' | 'history';
export const kriDetailTabs = ['overview', 'history'] as const;

interface UseKriDetailStateArgs {
    rawId: string | undefined;
    returnTo: string;
}

function isProtectedUnavailableError(error: unknown): boolean {
    return error instanceof ApiClientError && (error.status === 403 || error.status === 404);
}

export function useKriDetailState({ rawId, returnTo }: UseKriDetailStateArgs) {
    const navigate = useNavigate();
    const { t: tErrors } = useTranslation('errorKeys');
    const [activeTab, setActiveTab] = useContentTabQuery<KriDetailTabView>({
        tabs: kriDetailTabs,
        defaultTab: 'overview',
    });
    const [approvalBanner, setApprovalBanner] = useState<{ message: string } | null>(null);
    const {
        applyFailure: applyHistoryFailure,
        applySuccess: applyHistorySuccess,
        beginQuery: beginHistoryQuery,
        capabilities: historyCapabilities,
        isLoading: isLoadingHistory,
        items: history,
        outcome: historyOutcome,
        reset: resetHistory,
        setIsLoading: setIsLoadingHistory,
        totalCount: historyTotal,
    } = useCollectionDataState<KRIHistoryEntry, KRIHistoryCapabilities>();
    const {
        applyFailure: applyLinkedRiskFailure,
        applySuccess: applyLinkedRiskSuccess,
        beginQuery: beginLinkedRiskQuery,
        items: linkedRisks,
        outcome: linkedRiskOutcome,
        reset: resetLinkedRisk,
        setIsLoading: setLinkedRiskLoading,
    } = useCollectionDataState<Risk>();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [isValueModalOpen, setIsValueModalOpen] = useState(false);
    const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<KRIHistoryEntry | null>(null);
    const historyControllerRef = useRef<AbortController | null>(null);
    const linkedRiskControllerRef = useRef<AbortController | null>(null);
    const loadKRI = useCallback(
        (id: number, signal?: AbortSignal) => kriApi.getKRI(id, { include_archived: true }, { signal }),
        [],
    );

    const {
        isRetrying,
        loadOutcome,
        refetch: fetchKRI,
        resource: kri,
        resourceId: kriId,
    } = useDetailQuery<KeyRiskIndicator>({
        entity: 'kri',
        rawId,
        load: loadKRI,
    });
    const detailOwnerRef = useRef<number | null>(kriId);
    detailOwnerRef.current = kriId;
    const linkedRisk = linkedRisks[0] ?? null;

    useEffect(() => () => {
        detailOwnerRef.current = null;
        historyControllerRef.current?.abort();
        linkedRiskControllerRef.current?.abort();
    }, []);

    const fetchLinkedRisk = useCallback(async (ownerId: number, riskId: number | null | undefined) => {
        linkedRiskControllerRef.current?.abort();
        const controller = new AbortController();
        linkedRiskControllerRef.current = controller;
        const queryIdentity = `${ownerId}:${riskId ?? 'none'}`;
        beginLinkedRiskQuery(queryIdentity);
        setLinkedRiskLoading(true);

        if (!riskId) {
            applyLinkedRiskSuccess(queryIdentity, {
                items: [],
                groups: [],
                capabilities: null,
                total: 0,
            });
            setLinkedRiskLoading(false);
            linkedRiskControllerRef.current = null;
            return;
        }

        try {
            const risk = await riskApi.getRisk(riskId, { signal: controller.signal });
            if (
                controller.signal.aborted
                || linkedRiskControllerRef.current !== controller
                || detailOwnerRef.current !== ownerId
            ) return;
            applyLinkedRiskSuccess(queryIdentity, {
                items: [risk],
                groups: [],
                capabilities: null,
                total: 1,
            });
        } catch (error) {
            if (
                isAbortError(error)
                || controller.signal.aborted
                || linkedRiskControllerRef.current !== controller
                || detailOwnerRef.current !== ownerId
            ) return;
            applyLinkedRiskFailure(error, {
                fallbackErrorKey: 'errorKeys.unexpected',
                isAccessDenied: isProtectedUnavailableError,
                toErrorKey: (failure) => apiClient.toUiMessageKey(failure),
            });
        } finally {
            if (linkedRiskControllerRef.current === controller && detailOwnerRef.current === ownerId) {
                linkedRiskControllerRef.current = null;
                setLinkedRiskLoading(false);
            }
        }
    }, [
        applyLinkedRiskFailure,
        applyLinkedRiskSuccess,
        beginLinkedRiskQuery,
        setLinkedRiskLoading,
    ]);

    const fetchHistory = useCallback(async (id: number) => {
        if (detailOwnerRef.current !== id) return;
        historyControllerRef.current?.abort();
        const controller = new AbortController();
        historyControllerRef.current = controller;
        const queryIdentity = String(id);
        beginHistoryQuery(queryIdentity);
        setIsLoadingHistory(true);
        try {
            const response = await kriApi.getHistory(id, {
                size: 50,
                include_archived: true,
                sort_by: 'period',
                sort_direction: 'desc',
            }, { signal: controller.signal });
            if (
                controller.signal.aborted
                || historyControllerRef.current !== controller
                || detailOwnerRef.current !== id
            ) return;
            applyHistorySuccess(queryIdentity, {
                items: response.items,
                groups: [],
                capabilities: response.capabilities ?? null,
                total: response.total,
            });
        } catch (error) {
            if (
                isAbortError(error)
                || controller.signal.aborted
                || historyControllerRef.current !== controller
                || detailOwnerRef.current !== id
            ) return;
            logError('Failed to fetch history.', error);
            applyHistoryFailure(error, {
                fallbackErrorKey: 'errorKeys.unexpected',
                isAccessDenied: isProtectedUnavailableError,
                toErrorKey: (failure) => apiClient.toUiMessageKey(failure),
            });
        } finally {
            if (historyControllerRef.current === controller && detailOwnerRef.current === id) {
                historyControllerRef.current = null;
                setIsLoadingHistory(false);
            }
        }
    }, [
        applyHistoryFailure,
        applyHistorySuccess,
        beginHistoryQuery,
        setIsLoadingHistory,
    ]);

    useEffect(() => {
        setApprovalBanner(null);
        resetHistory();
        resetLinkedRisk();
        setIsDeleteDialogOpen(false);
        setIsDeleting(false);
        setIsEditModalOpen(false);
        setIsIssueModalOpen(false);
        setIsValueModalOpen(false);
        setSelectedHistoryEntry(null);
    }, [kriId, resetHistory, resetLinkedRisk]);

    useEffect(() => {
        if (!kri) {
            return;
        }
        const ownerId = kri.id;
        void fetchLinkedRisk(ownerId, kri.risk_id);
        void fetchHistory(ownerId);
        return () => {
            historyControllerRef.current?.abort();
            linkedRiskControllerRef.current?.abort();
        };
    }, [fetchHistory, fetchLinkedRisk, kri]);

    useEffect(() => {
        if (historyOutcome.kind === 'denied') {
            setSelectedHistoryEntry(null);
        }
    }, [historyOutcome.kind]);

    const handleDelete = useCallback(async (reason?: string) => {
        if (!kri) return;
        const ownerId = kri.id;
        const deleteReason = reason?.trim();
        if (!deleteReason) return;
        setIsDeleting(true);
        try {
            const result = await kriApi.deleteKRI(ownerId, deleteReason);
            if (detailOwnerRef.current !== ownerId) return;
            const parsed = parseUpdateResult(result);
            setIsDeleteDialogOpen(false);
            if (parsed.kind === 'approval') {
                setApprovalBanner({ message: parsed.message });
                return;
            }
            void navigate(returnTo);
        } catch (error) {
            if (detailOwnerRef.current !== ownerId) return;
            logError('Failed to delete KRI.', error);
        } finally {
            if (detailOwnerRef.current === ownerId) {
                setIsDeleting(false);
            }
        }
    }, [kri, navigate, returnTo]);

    const handleRestore = useCallback(async () => {
        if (!kri) return;
        const ownerId = kri.id;
        try {
            await kriApi.restoreKRI(ownerId);
            if (detailOwnerRef.current === ownerId) {
                await fetchKRI();
            }
        } catch (error) {
            if (detailOwnerRef.current !== ownerId) return;
            logError('Failed to restore KRI.', error);
        }
    }, [fetchKRI, kri]);

    const handleSave = useCallback(async (
        data: Partial<KeyRiskIndicator>,
        vendorIds: number[],
    ): Promise<KRIModalSaveResult> => {
        if (!kri) {
            throw new Error(tErrors('save_kri_failed'));
        }
        const ownerId = kri.id;
        try {
            const result = await kriApi.updateKRI(ownerId, {
                ...data,
                linked_vendor_ids: vendorIds,
            });
            if (detailOwnerRef.current !== ownerId) {
                return { kind: 'updated' };
            }
            const parsed = parseUpdateResult(result);
            if (parsed.kind === 'approval') {
                setApprovalBanner({ message: parsed.message });
                return parsed;
            }

            if (detailOwnerRef.current === ownerId) {
                await fetchKRI();
            }
            return { kind: 'updated' };
        } catch (error) {
            if (detailOwnerRef.current !== ownerId) {
                return { kind: 'updated' };
            }
            if (error instanceof ApiClientError || error instanceof Error) {
                throw error;
            }
            throw new Error(tErrors('save_kri_failed'), { cause: error });
        }
    }, [fetchKRI, kri, tErrors]);

    const handleRecordSuccess = useCallback(() => {
        if (kri && detailOwnerRef.current === kri.id) {
            void fetchKRI();
        }
    }, [fetchKRI, kri]);

    const dueDate = kri?.required_due_date ? new Date(kri.required_due_date) : null;
    const isOverdue = (kri?.days_overdue ?? 0) > 0;
    const canRequestHistoryCorrection =
        resolveCapabilityFlag(kri?.capabilities, 'can_request_history_correction') ||
        resolveCapabilityFlag(historyCapabilities, 'can_request_correction');
    const canRecordValue = resolveCapabilityFlag(
        kri?.capabilities,
        'can_submit_value',
    );

    return {
        activeTab,
        approvalBanner,
        canRecordValue,
        canRequestHistoryCorrection,
        dueDate,
        handleDelete,
        handleRecordSuccess,
        handleRestore,
        handleSave,
        history,
        historyOutcome,
        historyTotal,
        isDeleteDialogOpen,
        isDeleting,
        isEditModalOpen,
        isIssueModalOpen,
        isRetrying,
        isLoadingHistory,
        isOverdue,
        isValueModalOpen,
        kri,
        kriId,
        linkedRisk,
        linkedRiskOutcome,
        loadOutcome,
        refreshKri: fetchKRI,
        refreshHistory: fetchHistory,
        retryLinkedRisk: () => kri && fetchLinkedRisk(kri.id, kri.risk_id),
        selectedHistoryEntry,
        setActiveTab,
        setApprovalBanner,
        setIsDeleteDialogOpen,
        setIsEditModalOpen,
        setIsIssueModalOpen,
        setIsValueModalOpen,
        setSelectedHistoryEntry,
    };
}
