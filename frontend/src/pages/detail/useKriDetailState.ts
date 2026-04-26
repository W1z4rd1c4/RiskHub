import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { KRIModalSaveResult } from '@/components/kri/KRIModal';
import { useTranslation } from '@/i18n/hooks';
import { parseUpdateResult } from '@/lib/approvalUi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { ApiClientError } from '@/services/apiClient';
import { kriApi } from '@/services/kriApi';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
import type { KeyRiskIndicator, KRIHistoryCapabilities, KRIHistoryEntry } from '@/types/kri';
import type { Risk } from '@/types/risk';

import { useDetailResource } from './useDetailResource';

export type KriDetailTabView = 'overview' | 'history';

interface UseKriDetailStateArgs {
    rawId: string | undefined;
}

export function useKriDetailState({ rawId }: UseKriDetailStateArgs) {
    const navigate = useNavigate();
    const { t: tErrors } = useTranslation('errorKeys');
    const [activeTab, setActiveTab] = useState<KriDetailTabView>('overview');
    const [approvalBanner, setApprovalBanner] = useState<{ message: string } | null>(null);
    const [history, setHistory] = useState<KRIHistoryEntry[]>([]);
    const [historyCapabilities, setHistoryCapabilities] = useState<KRIHistoryCapabilities | null>(null);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isValueModalOpen, setIsValueModalOpen] = useState(false);
    const [linkedRisk, setLinkedRisk] = useState<Risk | null>(null);
    const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<KRIHistoryEntry | null>(null);
    const loadKRI = useCallback((id: number) => kriApi.getKRI(id, { include_archived: true }), []);

    const {
        isLoading,
        refetch: fetchKRI,
        resource: kri,
        resourceId: kriId,
    } = useDetailResource<KeyRiskIndicator>({
        rawId,
        load: loadKRI,
        toErrorKey: () => 'not_found',
    });

    const fetchHistory = useCallback(async (id: number) => {
        setIsLoadingHistory(true);
        try {
            const response = await kriApi.getHistory(id, { size: 50, include_archived: true });
            setHistory(response.items);
            setHistoryTotal(response.total);
            setHistoryCapabilities(response.capabilities ?? null);
        } catch (error) {
            logError('Failed to fetch history.', error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        if (!kri) {
            return;
        }
        if (kri.risk_id) {
            riskApi.getRisk(kri.risk_id)
                .then(setLinkedRisk)
                .catch(() => {
                    // The overview card already handles missing linked-risk details.
                });
        }
        void fetchHistory(kri.id);
    }, [fetchHistory, kri]);

    const handleDelete = useCallback(async (reason?: string) => {
        if (!kri) return;
        const deleteReason = reason?.trim();
        if (!deleteReason) return;
        setIsDeleting(true);
        try {
            const result = await kriApi.deleteKRI(kri.id, deleteReason);
            const parsed = parseUpdateResult(result);
            setIsDeleteDialogOpen(false);
            if (parsed.kind === 'approval') {
                setApprovalBanner({ message: parsed.message });
                return;
            }
            void navigate('/kris');
        } catch (error) {
            logError('Failed to delete KRI.', error);
        } finally {
            setIsDeleting(false);
        }
    }, [kri, navigate]);

    const handleRestore = useCallback(async () => {
        if (!kri) return;
        try {
            await kriApi.restoreKRI(kri.id);
            await fetchKRI();
        } catch (error) {
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
        try {
            const result = await kriApi.updateKRI(kri.id, {
                ...data,
                linked_vendor_ids: vendorIds,
            });
            const parsed = parseUpdateResult(result);
            if (parsed.kind === 'approval') {
                setApprovalBanner({ message: parsed.message });
                setIsEditModalOpen(false);
                return parsed;
            }

            await fetchKRI();
            setIsEditModalOpen(false);
            return { kind: 'updated' };
        } catch (error) {
            if (error instanceof ApiClientError || error instanceof Error) {
                throw error;
            }
            throw new Error(tErrors('save_kri_failed'), { cause: error });
        }
    }, [fetchKRI, kri, tErrors]);

    const handleRecordSuccess = useCallback(() => {
        if (kri) {
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
        historyTotal,
        isDeleteDialogOpen,
        isDeleting,
        isEditModalOpen,
        isIssueModalOpen,
        isLoading,
        isLoadingHistory,
        isOverdue,
        isValueModalOpen,
        kri,
        kriId,
        linkedRisk,
        refreshHistory: fetchHistory,
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
