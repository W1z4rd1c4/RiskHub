import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';
import { kriApi } from '@/services/kriApi';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
import type { DetailActionMessage } from '@/pages/detail/DetailActionBanner';
import { useArchiveRestoreAction } from '@/pages/detail/useArchiveRestoreAction';
import { useDetailResource } from '@/pages/detail/useDetailResource';
import type { HistoryTimelineItem } from '@/types/history';
import type { OverdueKRI } from '@/types/kri';
import type { ControlEffectiveness, Risk, RiskControlLink } from '@/types/risk';
import type { Vendor } from '@/types/vendor';

import { buildRiskKriHistoryItems } from './riskDetailHistory';

export type RiskDetailTabView = 'overview' | 'history' | 'assessment';
export type RiskLinkDialogMode = 'both' | 'search-only' | 'links-only';

interface RiskDetailData {
    linkedControls: RiskControlLink[];
    linkedVendors: Vendor[];
    overdueKRIs: OverdueKRI[];
    risk: Risk;
}

interface UseRiskDetailStateArgs {
    rawId: string | undefined;
}

async function loadRiskDetail(riskId: number): Promise<RiskDetailData> {
    const [risk, linkedControls, linkedVendors, overdueKRIs] = await Promise.all([
        riskApi.getRisk(riskId),
        riskApi.getLinkedControls(riskId),
        riskApi.getLinkedVendors(riskId),
        kriApi.getOverdue(),
    ]);
    return { linkedControls, linkedVendors, overdueKRIs, risk };
}

export function useRiskDetailState({ rawId }: UseRiskDetailStateArgs) {
    const navigate = useNavigate();
    const { i18n, t } = useTranslation('common');
    const [activeTab, setActiveTab] = useState<RiskDetailTabView>('overview');
    const [approvalMessage, setApprovalMessage] = useState<DetailActionMessage | null>(null);
    const [dialogMode, setDialogMode] = useState<RiskLinkDialogMode>('both');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [kriHistoryItems, setKriHistoryItems] = useState<HistoryTimelineItem[]>([]);
    const [linkErrorKey, setLinkErrorKey] = useState<string | null>(null);

    const {
        errorKey,
        isLoading,
        refetch,
        resource,
        resourceId,
        setResource,
    } = useDetailResource<RiskDetailData>({
        rawId,
        load: loadRiskDetail,
        toErrorKey: (error) => apiClient.toUiMessageKey(error),
    });

    const risk = resource?.risk ?? null;

    const { isRunning: isDeleting, runArchive, runRestore } = useArchiveRestoreAction({
        setMessage: setApprovalMessage,
        toErrorKey: (error) => apiClient.toUiMessageKey(error),
    });

    useEffect(() => {
        let cancelled = false;

        async function fetchKriHistory() {
            if (activeTab !== 'history' || !risk?.kris || risk.kris.length === 0) {
                setKriHistoryItems((prev) => (prev.length === 0 ? prev : []));
                setIsHistoryLoading(false);
                return;
            }

            setIsHistoryLoading(true);
            try {
                const results = await Promise.all(
                    risk.kris.map((kri) => kriApi.getHistory(kri.id, { size: 50 }).then((res) => ({ kri, items: res.items }))),
                );
                if (!cancelled) {
                    setKriHistoryItems(buildRiskKriHistoryItems(results, {
                        language: i18n.language,
                        recordedByLabel: t('risks:history.recorded_by'),
                        systemLabel: t('risks:history.system'),
                    }));
                }
            } catch (error) {
                logError('Failed to fetch KRI history.', error);
            } finally {
                if (!cancelled) {
                    setIsHistoryLoading(false);
                }
            }
        }

        void fetchKriHistory();

        return () => {
            cancelled = true;
        };
    }, [activeTab, i18n.language, risk?.kris, t]);

    const handleArchive = useCallback(async (reason?: string) => {
        if (!risk) return;
        await runArchive({
            archive: () => riskApi.deleteRisk(risk.id, reason || 'Archived by user'),
            approvalKey: 'risks:messages.archive_submitted_for_approval',
            closeDialog: () => setIsDeleteDialogOpen(false),
            onImmediate: () => navigate('/risks'),
        });
        setIsDeleteDialogOpen(false);
    }, [navigate, risk, runArchive]);

    const handleRestore = useCallback(async () => {
        if (!risk) return;
        await runRestore({
            restore: () => riskApi.restoreRisk(risk.id),
            successKey: 'risks:messages.restore_success',
            onRestored: refetch,
        });
    }, [refetch, risk, runRestore]);

    const handleLinkControl = useCallback(async (
        controlId: number,
        effectiveness: ControlEffectiveness,
        notes?: string,
    ) => {
        if (!risk || !resource) return;
        setLinkErrorKey(null);
        try {
            await riskApi.linkControl(risk.id, { control_id: controlId, effectiveness, notes });
            const linkedControls = await riskApi.getLinkedControls(risk.id);
            setResource({ ...resource, linkedControls });
        } catch (error) {
            logError('Linking failed.', error);
            setLinkErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [resource, risk, setResource]);

    const handleUnlinkControl = useCallback(async (controlId: number) => {
        if (!risk || !resource) return;
        setLinkErrorKey(null);
        try {
            await riskApi.unlinkControl(risk.id, controlId);
            const linkedControls = await riskApi.getLinkedControls(risk.id);
            setResource({ ...resource, linkedControls });
        } catch (error) {
            logError('Unlinking failed.', error);
            setLinkErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [resource, risk, setResource]);

    return {
        activeTab,
        approvalMessage,
        dialogMode,
        errorKey,
        isCreateDialogOpen,
        isDeleteDialogOpen,
        isDeleting,
        isHistoryLoading,
        isIssueModalOpen,
        isLinkDialogOpen,
        isLoading,
        kriHistoryItems,
        linkErrorKey,
        linkedControls: resource?.linkedControls ?? [],
        linkedVendors: resource?.linkedVendors ?? [],
        overdueKRIs: resource?.overdueKRIs ?? [],
        resourceId,
        risk,
        handleArchive,
        handleLinkControl,
        handleRestore,
        handleUnlinkControl,
        refreshData: refetch,
        setActiveTab,
        setApprovalMessage,
        setDialogMode,
        setIsCreateDialogOpen,
        setIsDeleteDialogOpen,
        setIsIssueModalOpen,
        setIsLinkDialogOpen,
        setLinkErrorKey,
    };
}
