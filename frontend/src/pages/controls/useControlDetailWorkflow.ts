import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import { apiClient } from '@/services/apiClient';
import { logError } from '@/services/logger';
import type { Control, ControlRiskLink } from '@/types/control';
import type { ControlEffectiveness, Risk } from '@/types/risk';
import type { DetailActionMessage } from '@/pages/detail/DetailActionBanner';
import { useArchiveRestoreAction } from '@/pages/detail/useArchiveRestoreAction';

type TabView = 'overview' | 'history';

interface ControlDetailWorkflowArgs {
    control: Control | null;
    controlId: number | null;
    fetchControl: () => Promise<void>;
    navigate: NavigateFunction;
}

export function useControlDetailWorkflow({
    control,
    controlId,
    fetchControl,
    navigate,
}: ControlDetailWorkflowArgs) {
    const [linkedRisks, setLinkedRisks] = useState<ControlRiskLink[]>([]);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [historyKey, setHistoryKey] = useState(0);
    const [activeTab, setActiveTab] = useState<TabView>('overview');
    const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
    const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
    const [isLoadingRisk, setIsLoadingRisk] = useState(false);
    const [linkedRisksErrorKey, setLinkedRisksErrorKey] = useState<string | null>(null);
    const [linkErrorKey, setLinkErrorKey] = useState<string | null>(null);
    const [approvalMessage, setApprovalMessage] = useState<DetailActionMessage | null>(null);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const { runArchive, runRestore } = useArchiveRestoreAction({
        setMessage: setApprovalMessage,
        toErrorKey: (error) => apiClient.toUiMessageKey(error),
    });

    const fetchLinkedRisks = useCallback(async () => {
        if (controlId === null) return;

        try {
            const riskData = await controlApi.getLinkedRisks(controlId);
            setLinkedRisks(riskData);
            setLinkedRisksErrorKey(null);
        } catch (err) {
            logError('Error fetching linked risks:', err);
            setLinkedRisksErrorKey('controls:detail.linked_risks_load_failed');
        }
    }, [controlId]);

    useEffect(() => {
        void fetchLinkedRisks();
    }, [fetchLinkedRisks]);

    async function handleArchive(reason: string): Promise<void> {
        if (!control) return;
        await runArchive({
            archive: () => controlApi.deleteControl(control.id, reason),
            approvalKey: 'controls:detail.archive_approval_submitted',
            closeDialog: () => setIsArchiveDialogOpen(false),
            onImmediate: () => navigate('/controls'),
        });
    }

    async function handleRestore(): Promise<void> {
        if (!control) return;
        await runRestore({
            restore: () => controlApi.restoreControl(control.id),
            successKey: 'controls:detail.control_restored',
            onRestored: async () => {
                await fetchControl();
                await fetchLinkedRisks();
            },
        });
    }

    async function handleLinkRisk(
        riskId: number,
        effectiveness: ControlEffectiveness,
        notes?: string,
    ): Promise<void> {
        if (!control) return;
        setLinkErrorKey(null);
        try {
            await controlApi.linkRisk(control.id, { risk_id: riskId, effectiveness, notes });
            setLinkedRisks(await controlApi.getLinkedRisks(control.id));
        } catch (err) {
            logError('Linking failed:', err);
            setLinkErrorKey(apiClient.toUiMessageKey(err));
        }
    }

    async function handleUnlinkRisk(riskId: number): Promise<void> {
        if (!control) return;
        setLinkErrorKey(null);
        try {
            await controlApi.unlinkRisk(control.id, riskId);
            setLinkedRisks(await controlApi.getLinkedRisks(control.id));
        } catch (err) {
            logError('Unlinking failed:', err);
            setLinkErrorKey(apiClient.toUiMessageKey(err));
        }
    }

    async function handleRiskClick(riskId: number, e: MouseEvent): Promise<void> {
        e.stopPropagation();
        setIsLoadingRisk(true);
        try {
            const risk = await riskApi.getRisk(riskId);
            setSelectedRisk(risk);
            setIsRiskModalOpen(true);
        } catch (err) {
            logError('Failed to fetch risk details:', err);
        } finally {
            setIsLoadingRisk(false);
        }
    }

    function closeRiskModal(): void {
        setIsRiskModalOpen(false);
        setSelectedRisk(null);
    }

    function handleExecutionLogged(): void {
        setHistoryKey((prev) => prev + 1);
        void fetchControl();
    }

    return {
        activeTab,
        approvalMessage,
        closeRiskModal,
        handleArchive,
        handleExecutionLogged,
        handleLinkRisk,
        handleRestore,
        handleRiskClick,
        handleUnlinkRisk,
        historyKey,
        isArchiveDialogOpen,
        isIssueModalOpen,
        isLinkDialogOpen,
        isLoadingRisk,
        isLogModalOpen,
        isRiskModalOpen,
        linkErrorKey,
        linkedRisks,
        linkedRisksErrorKey,
        selectedRisk,
        setActiveTab,
        setApprovalMessage,
        setIsArchiveDialogOpen,
        setIsIssueModalOpen,
        setIsLinkDialogOpen,
        setIsLogModalOpen,
    };
}
