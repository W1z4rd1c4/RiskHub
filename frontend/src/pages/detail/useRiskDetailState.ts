import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { useTranslation } from '@/i18n/hooks';
import type { DetailActionMessage } from '@/pages/detail/DetailActionBanner';
import { useArchiveRestoreAction } from '@/pages/detail/useArchiveRestoreAction';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { useCollectionDataState } from '@/pages/shared/collectionPageState';
import { ApiClientError, apiClient } from '@/services/apiClient';
import { isAbortError } from '@/services/api/requestRuntime';
import { kriApi } from '@/services/kriApi';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
import type { HistoryTimelineItem } from '@/types/history';
import type { OverdueKRI } from '@/types/kri';
import type { ControlEffectiveness, Risk, RiskControlLink } from '@/types/risk';
import type { Vendor } from '@/types/vendor';

import { buildRiskKriHistoryItems } from './riskDetailHistory';

export type RiskDetailTabView = 'overview' | 'history' | 'assessment';
export type RiskLinkDialogMode = 'both' | 'search-only' | 'links-only';
export const riskDetailTabs = ['overview', 'history', 'assessment'] as const;

interface UseRiskDetailStateArgs {
    rawId: string | undefined;
    returnTo: string;
}

function collectionPayload<T>(items: T[]) {
    return { items, groups: [], capabilities: null, total: items.length };
}

const sidecarFailureOptions = {
    fallbackErrorKey: 'errorKeys.unexpected',
    toErrorKey: (error: unknown) => apiClient.toUiMessageKey(error),
};

function isProtectedUnavailableError(error: unknown): boolean {
    return error instanceof ApiClientError && (error.status === 403 || error.status === 404);
}

const protectedSidecarFailureOptions = {
    ...sidecarFailureOptions,
    isAccessDenied: isProtectedUnavailableError,
};

export function useRiskDetailState({ rawId, returnTo }: UseRiskDetailStateArgs) {
    const navigate = useNavigate();
    const { i18n, t } = useTranslation('common');
    const [activeTab, setActiveTab] = useContentTabQuery<RiskDetailTabView>({
        tabs: riskDetailTabs,
        defaultTab: 'overview',
    });
    const [approvalMessage, setApprovalMessage] = useState<DetailActionMessage | null>(null);
    const [dialogMode, setDialogMode] = useState<RiskLinkDialogMode>('both');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [linkErrorKey, setLinkErrorKey] = useState<string | null>(null);
    const {
        applyFailure: applyLinkedControlsFailure,
        applySuccess: applyLinkedControlsSuccess,
        beginQuery: beginLinkedControlsQuery,
        items: linkedControls,
        outcome: linkedControlsOutcome,
        reset: resetLinkedControls,
        setIsLoading: setLinkedControlsLoading,
    } = useCollectionDataState<RiskControlLink>();
    const {
        applyFailure: applyLinkedVendorsFailure,
        applySuccess: applyLinkedVendorsSuccess,
        beginQuery: beginLinkedVendorsQuery,
        items: linkedVendors,
        outcome: linkedVendorsOutcome,
        reset: resetLinkedVendors,
        setIsLoading: setLinkedVendorsLoading,
    } = useCollectionDataState<Vendor>();
    const {
        applyFailure: applyOverdueKrisFailure,
        applySuccess: applyOverdueKrisSuccess,
        beginQuery: beginOverdueKrisQuery,
        items: overdueKRIs,
        outcome: overdueKrisOutcome,
        reset: resetOverdueKris,
        setIsLoading: setOverdueKrisLoading,
    } = useCollectionDataState<OverdueKRI>();
    const {
        applyFailure: applyKriHistoryFailure,
        applySuccess: applyKriHistorySuccess,
        beginQuery: beginKriHistoryQuery,
        items: kriHistoryItems,
        outcome: kriHistoryOutcome,
        reset: resetKriHistory,
        setIsLoading: setKriHistoryLoading,
    } = useCollectionDataState<HistoryTimelineItem>();
    const controllersRef = useRef<Record<string, AbortController | undefined>>({});
    const loadRisk = useCallback(
        (riskId: number, signal?: AbortSignal) => riskApi.getRisk(riskId, { signal }),
        [],
    );

    const {
        isRetrying,
        loadOutcome,
        refetch,
        resource: risk,
        resourceId,
    } = useDetailQuery<Risk>({ entity: 'risk', rawId, load: loadRisk });
    const detailOwnerRef = useRef(resourceId);
    detailOwnerRef.current = resourceId;

    useEffect(() => () => {
        detailOwnerRef.current = null;
        Object.values(controllersRef.current).forEach((controller) => controller?.abort());
    }, []);

    const replaceController = useCallback((lane: string) => {
        controllersRef.current[lane]?.abort();
        const controller = new AbortController();
        controllersRef.current[lane] = controller;
        return controller;
    }, []);

    const fetchLinkedControls = useCallback(async (ownerId: number) => {
        const queryIdentity = String(ownerId);
        const controller = replaceController('controls');
        beginLinkedControlsQuery(queryIdentity);
        setLinkedControlsLoading(true);
        try {
            const items = await riskApi.getLinkedControls(ownerId, { signal: controller.signal });
            if (controller.signal.aborted || detailOwnerRef.current !== ownerId) return;
            applyLinkedControlsSuccess(queryIdentity, collectionPayload(items));
        } catch (error) {
            if (isAbortError(error) || controller.signal.aborted || detailOwnerRef.current !== ownerId) return;
            applyLinkedControlsFailure(error, protectedSidecarFailureOptions);
        } finally {
            if (detailOwnerRef.current === ownerId && !controller.signal.aborted) {
                setLinkedControlsLoading(false);
            }
        }
    }, [
        applyLinkedControlsFailure,
        applyLinkedControlsSuccess,
        beginLinkedControlsQuery,
        replaceController,
        setLinkedControlsLoading,
    ]);

    const fetchLinkedVendors = useCallback(async (ownerId: number) => {
        const queryIdentity = String(ownerId);
        const controller = replaceController('vendors');
        beginLinkedVendorsQuery(queryIdentity);
        setLinkedVendorsLoading(true);
        try {
            const items = await riskApi.getLinkedVendors(ownerId, { signal: controller.signal });
            if (controller.signal.aborted || detailOwnerRef.current !== ownerId) return;
            applyLinkedVendorsSuccess(queryIdentity, collectionPayload(items));
        } catch (error) {
            if (isAbortError(error) || controller.signal.aborted || detailOwnerRef.current !== ownerId) return;
            applyLinkedVendorsFailure(error, protectedSidecarFailureOptions);
        } finally {
            if (detailOwnerRef.current === ownerId && !controller.signal.aborted) {
                setLinkedVendorsLoading(false);
            }
        }
    }, [
        applyLinkedVendorsFailure,
        applyLinkedVendorsSuccess,
        beginLinkedVendorsQuery,
        replaceController,
        setLinkedVendorsLoading,
    ]);

    const fetchOverdueKris = useCallback(async (ownerId: number) => {
        const queryIdentity = String(ownerId);
        const controller = replaceController('overdue-kris');
        beginOverdueKrisQuery(queryIdentity);
        setOverdueKrisLoading(true);
        try {
            const items = await kriApi.getOverdue(undefined, { signal: controller.signal });
            if (controller.signal.aborted || detailOwnerRef.current !== ownerId) return;
            applyOverdueKrisSuccess(queryIdentity, collectionPayload(items));
        } catch (error) {
            if (isAbortError(error) || controller.signal.aborted || detailOwnerRef.current !== ownerId) return;
            applyOverdueKrisFailure(error, sidecarFailureOptions);
        } finally {
            if (detailOwnerRef.current === ownerId && !controller.signal.aborted) {
                setOverdueKrisLoading(false);
            }
        }
    }, [
        applyOverdueKrisFailure,
        applyOverdueKrisSuccess,
        beginOverdueKrisQuery,
        replaceController,
        setOverdueKrisLoading,
    ]);

    const fetchKriHistory = useCallback(async (
        ownerId: number,
        kris: NonNullable<Risk['kris']>,
    ) => {
        const queryIdentity = String(ownerId);
        const controller = replaceController('kri-history');
        beginKriHistoryQuery(queryIdentity);
        setKriHistoryLoading(true);
        if (kris.length === 0) {
            applyKriHistorySuccess(queryIdentity, collectionPayload([]));
            setKriHistoryLoading(false);
            return;
        }
        try {
            const results = await Promise.all(
                kris.map((kri) => kriApi.getHistory(
                    kri.id,
                    { size: 50 },
                    { signal: controller.signal },
                ).then((response) => ({ kri, items: response.items }))),
            );
            if (controller.signal.aborted || detailOwnerRef.current !== ownerId) return;
            const items = buildRiskKriHistoryItems(results, {
                language: i18n.language,
                recordedByLabel: t('risks:history.recorded_by'),
                systemLabel: t('risks:history.system'),
            });
            applyKriHistorySuccess(queryIdentity, collectionPayload(items));
        } catch (error) {
            if (isAbortError(error) || controller.signal.aborted || detailOwnerRef.current !== ownerId) return;
            logError('Failed to fetch KRI history.', error);
            applyKriHistoryFailure(error, protectedSidecarFailureOptions);
        } finally {
            if (detailOwnerRef.current === ownerId && !controller.signal.aborted) {
                setKriHistoryLoading(false);
            }
        }
    }, [
        i18n.language,
        applyKriHistoryFailure,
        applyKriHistorySuccess,
        beginKriHistoryQuery,
        replaceController,
        setKriHistoryLoading,
        t,
    ]);

    const { isRunning: isDeleting, runArchive, runRestore } = useArchiveRestoreAction({
        setMessage: setApprovalMessage,
        toErrorKey: (error) => apiClient.toUiMessageKey(error),
    });

    useEffect(() => {
        Object.values(controllersRef.current).forEach((controller) => controller?.abort());
        controllersRef.current = {};
        resetLinkedControls();
        resetLinkedVendors();
        resetOverdueKris();
        resetKriHistory();
        setApprovalMessage(null);
        setDialogMode('both');
        setIsCreateDialogOpen(false);
        setIsDeleteDialogOpen(false);
        setIsIssueModalOpen(false);
        setIsLinkDialogOpen(false);
        setLinkErrorKey(null);
    }, [
        resetKriHistory,
        resetLinkedControls,
        resetLinkedVendors,
        resetOverdueKris,
        resourceId,
    ]);

    useEffect(() => {
        if (!risk) return;
        void fetchLinkedControls(risk.id);
        void fetchLinkedVendors(risk.id);
        void fetchOverdueKris(risk.id);
    }, [fetchLinkedControls, fetchLinkedVendors, fetchOverdueKris, risk]);

    useEffect(() => {
        if (activeTab === 'history' && risk) {
            void fetchKriHistory(risk.id, risk.kris ?? []);
        }
    }, [activeTab, fetchKriHistory, risk]);

    const refreshData = useCallback(async () => {
        const ownerId = detailOwnerRef.current;
        if (ownerId === null) return;
        await Promise.all([
            refetch(),
            fetchLinkedControls(ownerId),
            fetchLinkedVendors(ownerId),
            fetchOverdueKris(ownerId),
        ]);
    }, [fetchLinkedControls, fetchLinkedVendors, fetchOverdueKris, refetch]);

    const handleArchive = useCallback(async (reason?: string) => {
        if (!risk) return;
        await runArchive({
            archive: () => riskApi.deleteRisk(risk.id, reason || 'Archived by user'),
            approvalKey: 'risks:messages.archive_submitted_for_approval',
            closeDialog: () => setIsDeleteDialogOpen(false),
            isCurrent: () => detailOwnerRef.current === risk.id,
            onImmediate: () => navigate(returnTo),
        });
        if (detailOwnerRef.current === risk.id) {
            setIsDeleteDialogOpen(false);
        }
    }, [navigate, returnTo, risk, runArchive]);

    const handleRestore = useCallback(async () => {
        if (!risk) return;
        const ownerId = risk.id;
        await runRestore({
            restore: () => riskApi.restoreRisk(ownerId),
            successKey: 'risks:messages.restore_success',
            isCurrent: () => detailOwnerRef.current === ownerId,
            onRestored: async () => {
                if (detailOwnerRef.current === ownerId) await refreshData();
            },
        });
    }, [refreshData, risk, runRestore]);

    const handleLinkControl = useCallback(async (
        controlId: number,
        effectiveness: ControlEffectiveness,
        notes?: string,
    ) => {
        if (!risk) return;
        const ownerId = risk.id;
        setLinkErrorKey(null);
        try {
            await riskApi.linkControl(ownerId, { control_id: controlId, effectiveness, notes });
            if (detailOwnerRef.current === ownerId) await fetchLinkedControls(ownerId);
        } catch (error) {
            if (detailOwnerRef.current !== ownerId) return;
            logError('Linking failed.', error);
            setLinkErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchLinkedControls, risk]);

    const handleUnlinkControl = useCallback(async (controlId: number) => {
        if (!risk) return;
        const ownerId = risk.id;
        setLinkErrorKey(null);
        try {
            await riskApi.unlinkControl(ownerId, controlId);
            if (detailOwnerRef.current === ownerId) await fetchLinkedControls(ownerId);
        } catch (error) {
            if (detailOwnerRef.current !== ownerId) return;
            logError('Unlinking failed.', error);
            setLinkErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchLinkedControls, risk]);

    return {
        activeTab,
        approvalMessage,
        dialogMode,
        handleArchive,
        handleLinkControl,
        handleRestore,
        handleUnlinkControl,
        isCreateDialogOpen,
        isDeleteDialogOpen,
        isDeleting,
        isIssueModalOpen,
        isLinkDialogOpen,
        isRetrying,
        kriHistoryItems,
        kriHistoryOutcome,
        linkErrorKey,
        linkedControls,
        linkedControlsOutcome,
        linkedVendors,
        linkedVendorsOutcome,
        loadOutcome,
        overdueKRIs,
        overdueKrisOutcome,
        refreshData,
        resourceId,
        retryKriHistory: () => risk && fetchKriHistory(risk.id, risk.kris ?? []),
        retryLinkedControls: () => risk && fetchLinkedControls(risk.id),
        retryLinkedVendors: () => risk && fetchLinkedVendors(risk.id),
        retryOverdueKris: () => risk && fetchOverdueKris(risk.id),
        risk,
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
