import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import { ApiClientError, apiClient } from '@/services/apiClient';
import { logError } from '@/services/logger';
import type { Control, ControlRiskLink } from '@/types/control';
import type { ControlEffectiveness, Risk } from '@/types/risk';
import type { DetailActionMessage } from '@/pages/detail/DetailActionBanner';
import { useArchiveRestoreAction } from '@/pages/detail/useArchiveRestoreAction';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { isAbortError } from '@/services/api/requestRuntime';

type TabView = 'overview' | 'history';
type LinkedRisksOutcome = 'loading' | 'content' | 'empty' | 'error' | 'stale-with-error' | 'denied';
export const controlDetailTabs = ['overview', 'history'] as const;

interface ControlDetailWorkflowArgs {
    control: Control | null;
    controlId: number | null;
    fetchControl: () => Promise<void>;
    navigate: NavigateFunction;
    returnTo: string;
}

export function useControlDetailWorkflow({
    control,
    controlId,
    fetchControl,
    navigate,
    returnTo,
}: ControlDetailWorkflowArgs) {
    const [linkedRisks, setLinkedRisks] = useState<ControlRiskLink[]>([]);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [historyKey, setHistoryKey] = useState(0);
    const [activeTab, setActiveTab] = useContentTabQuery<TabView>({
        tabs: controlDetailTabs,
        defaultTab: 'overview',
    });
    const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
    const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
    const [isLoadingRisk, setIsLoadingRisk] = useState(false);
    const [linkedRisksErrorKey, setLinkedRisksErrorKey] = useState<string | null>(null);
    const [linkedRisksOutcome, setLinkedRisksOutcome] = useState<LinkedRisksOutcome>('loading');
    const [linkErrorKey, setLinkErrorKey] = useState<string | null>(null);
    const [approvalMessage, setApprovalMessage] = useState<DetailActionMessage | null>(null);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const detailOwnerRef = useRef(controlId);
    const hasSuccessfulLinkedRisksLoadRef = useRef(false);
    const linkedRisksControllerRef = useRef<AbortController | null>(null);
    const riskQuickViewControllerRef = useRef<AbortController | null>(null);
    detailOwnerRef.current = controlId;

    const { runArchive, runRestore } = useArchiveRestoreAction({
        setMessage: setApprovalMessage,
        toErrorKey: (error) => apiClient.toUiMessageKey(error),
    });

    useEffect(() => () => {
        detailOwnerRef.current = null;
        linkedRisksControllerRef.current?.abort();
        riskQuickViewControllerRef.current?.abort();
    }, []);

    useEffect(() => {
        linkedRisksControllerRef.current?.abort();
        riskQuickViewControllerRef.current?.abort();
        setLinkedRisks([]);
        hasSuccessfulLinkedRisksLoadRef.current = false;
        setIsLinkDialogOpen(false);
        setIsLogModalOpen(false);
        setIsArchiveDialogOpen(false);
        setHistoryKey(0);
        setSelectedRisk(null);
        setIsRiskModalOpen(false);
        setIsLoadingRisk(false);
        setLinkedRisksErrorKey(null);
        setLinkedRisksOutcome('loading');
        setLinkErrorKey(null);
        setApprovalMessage(null);
        setIsIssueModalOpen(false);
    }, [controlId]);

    const fetchLinkedRisks = useCallback(async (ownerId: number) => {
        linkedRisksControllerRef.current?.abort();
        const controller = new AbortController();
        linkedRisksControllerRef.current = controller;
        if (!hasSuccessfulLinkedRisksLoadRef.current) {
            setLinkedRisksOutcome('loading');
        }
        try {
            const riskData = await controlApi.getLinkedRisks(ownerId, { signal: controller.signal });
            if (
                controller.signal.aborted
                || linkedRisksControllerRef.current !== controller
                || detailOwnerRef.current !== ownerId
            ) return;
            setLinkedRisks(riskData);
            hasSuccessfulLinkedRisksLoadRef.current = true;
            setLinkedRisksErrorKey(null);
            setLinkedRisksOutcome(riskData.length > 0 ? 'content' : 'empty');
        } catch (err) {
            if (
                isAbortError(err)
                || controller.signal.aborted
                || linkedRisksControllerRef.current !== controller
                || detailOwnerRef.current !== ownerId
            ) return;
            logError('Error fetching linked risks:', err);
            if (err instanceof ApiClientError && (err.status === 403 || err.status === 404)) {
                riskQuickViewControllerRef.current?.abort();
                riskQuickViewControllerRef.current = null;
                setLinkedRisks([]);
                hasSuccessfulLinkedRisksLoadRef.current = false;
                setLinkedRisksErrorKey(null);
                setLinkedRisksOutcome('denied');
                setIsLinkDialogOpen(false);
                setSelectedRisk(null);
                setIsRiskModalOpen(false);
                setIsLoadingRisk(false);
            } else {
                setLinkedRisksErrorKey('controls:detail.linked_risks_load_failed');
                setLinkedRisksOutcome(
                    hasSuccessfulLinkedRisksLoadRef.current ? 'stale-with-error' : 'error',
                );
            }
        } finally {
            if (linkedRisksControllerRef.current === controller) {
                linkedRisksControllerRef.current = null;
            }
        }
    }, []);

    useEffect(() => {
        if (controlId === null) return;
        void fetchLinkedRisks(controlId);
        return () => linkedRisksControllerRef.current?.abort();
    }, [controlId, fetchLinkedRisks]);

    async function handleArchive(reason: string): Promise<void> {
        if (!control) return;
        const ownerId = control.id;
        const outcome = await runArchive({
            archive: () => controlApi.deleteControl(ownerId, reason),
            approvalKey: 'controls:detail.archive_approval_submitted',
            isCurrent: () => detailOwnerRef.current === ownerId,
            onImmediate: () => navigate(returnTo),
        });
        if (outcome.kind === 'failed') {
            throw outcome.error;
        }
    }

    async function handleRestore(): Promise<void> {
        if (!control) return;
        const ownerId = control.id;
        await runRestore({
            restore: () => controlApi.restoreControl(ownerId),
            successKey: 'controls:detail.control_restored',
            isCurrent: () => detailOwnerRef.current === ownerId,
            onRestored: async () => {
                if (detailOwnerRef.current !== ownerId) return;
                await fetchControl();
                if (detailOwnerRef.current !== ownerId) return;
                await fetchLinkedRisks(ownerId);
            },
        });
    }

    async function handleLinkRisk(
        riskId: number,
        effectiveness: ControlEffectiveness,
        notes?: string,
    ): Promise<void> {
        if (!control) return;
        const ownerId = control.id;
        setLinkErrorKey(null);
        try {
            await controlApi.linkRisk(ownerId, { risk_id: riskId, effectiveness, notes });
            if (detailOwnerRef.current !== ownerId) return;
            await fetchLinkedRisks(ownerId);
        } catch (err) {
            if (detailOwnerRef.current !== ownerId) return;
            logError('Linking failed:', err);
            setLinkErrorKey(apiClient.toUiMessageKey(err));
        }
    }

    async function handleUnlinkRisk(riskId: number): Promise<void> {
        if (!control) return;
        const ownerId = control.id;
        setLinkErrorKey(null);
        try {
            await controlApi.unlinkRisk(ownerId, riskId);
            if (detailOwnerRef.current !== ownerId) return;
            await fetchLinkedRisks(ownerId);
        } catch (err) {
            if (detailOwnerRef.current !== ownerId) return;
            logError('Unlinking failed:', err);
            setLinkErrorKey(apiClient.toUiMessageKey(err));
        }
    }

    async function handleRiskClick(riskId: number, e: MouseEvent): Promise<void> {
        e.stopPropagation();
        const ownerId = detailOwnerRef.current;
        if (ownerId === null) return;
        riskQuickViewControllerRef.current?.abort();
        const controller = new AbortController();
        riskQuickViewControllerRef.current = controller;
        setIsLoadingRisk(true);
        try {
            const risk = await riskApi.getRisk(riskId, { signal: controller.signal });
            if (
                controller.signal.aborted
                || riskQuickViewControllerRef.current !== controller
                || detailOwnerRef.current !== ownerId
            ) return;
            setSelectedRisk(risk);
            setIsRiskModalOpen(true);
        } catch (err) {
            if (
                isAbortError(err)
                || controller.signal.aborted
                || riskQuickViewControllerRef.current !== controller
                || detailOwnerRef.current !== ownerId
            ) return;
            logError('Failed to fetch risk details:', err);
        } finally {
            if (riskQuickViewControllerRef.current === controller && detailOwnerRef.current === ownerId) {
                setIsLoadingRisk(false);
                riskQuickViewControllerRef.current = null;
            }
        }
    }

    function closeRiskModal(): void {
        riskQuickViewControllerRef.current?.abort();
        riskQuickViewControllerRef.current = null;
        setIsLoadingRisk(false);
        setIsRiskModalOpen(false);
        setSelectedRisk(null);
    }

    function handleExecutionLogged(): void {
        if (controlId === null || detailOwnerRef.current !== controlId) return;
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
        linkedRisksOutcome,
        retryLinkedRisks: () => controlId !== null && fetchLinkedRisks(controlId),
        selectedRisk,
        setActiveTab,
        setApprovalMessage,
        setIsArchiveDialogOpen,
        setIsIssueModalOpen,
        setIsLinkDialogOpen,
        setIsLogModalOpen,
    };
}
