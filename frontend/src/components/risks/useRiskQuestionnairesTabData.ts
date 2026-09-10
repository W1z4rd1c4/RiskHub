import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiClientError, apiClient, isForbiddenApiError } from '@/services/apiClient';
import { isAbortError } from '@/services/api/requestRuntime';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import type { RiskQuestionnaireDetail, RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import type { TranslateFn } from './risk-questionnaire-detail/questionnairePresentation';

interface UseRiskQuestionnairesTabDataParams {
    canSend: boolean;
    riskId: number;
    t: TranslateFn;
}

export type RiskQuestionnairesLoadOutcome =
    | 'initial-loading'
    | 'content'
    | 'fatal-error'
    | 'stale-with-error'
    | 'denied';

export type LatestSubmittedLoadOutcome =
    | 'empty'
    | 'loading'
    | 'content'
    | 'fatal-error'
    | 'stale-with-error'
    | 'denied';

function isProtectedUnavailableError(error: unknown): boolean {
    return isForbiddenApiError(error) || error instanceof ApiClientError && error.status === 404;
}

export function useRiskQuestionnairesTabData({
    canSend,
    riskId,
    t,
}: UseRiskQuestionnairesTabDataParams) {
    const [items, setItems] = useState<RiskQuestionnaireListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [latestSubmitted, setLatestSubmitted] = useState<RiskQuestionnaireDetail | null>(null);
    const [latestSubmittedLoading, setLatestSubmittedLoading] = useState(false);
    const [latestSubmittedOutcome, setLatestSubmittedOutcome] = useState<LatestSubmittedLoadOutcome>('empty');
    const [latestSubmittedRefreshKey, setLatestSubmittedRefreshKey] = useState(0);
    const [loadOutcome, setLoadOutcome] = useState<RiskQuestionnairesLoadOutcome>('initial-loading');
    const ownerRef = useRef<number | null>(riskId);
    const itemsOwnerRef = useRef<number | null>(null);
    const latestSubmittedRef = useRef<RiskQuestionnaireDetail | null>(null);
    const hasSuccessfulLoadRef = useRef(false);
    const latestSubmittedControllerRef = useRef<AbortController | null>(null);
    const refreshControllerRef = useRef<AbortController | null>(null);
    const sendControllerRef = useRef<AbortController | null>(null);
    ownerRef.current = riskId;

    useEffect(() => () => {
        ownerRef.current = null;
        latestSubmittedControllerRef.current?.abort();
        refreshControllerRef.current?.abort();
        sendControllerRef.current?.abort();
    }, []);

    const ownedItems = useMemo(
        () => (itemsOwnerRef.current === riskId ? items : []),
        [items, riskId],
    );
    const openItem = useMemo(
        () => ownedItems.find((item) => item.status === 'sent' || item.status === 'in_progress') ?? null,
        [ownedItems],
    );

    const latestSubmittedItem = useMemo(() => {
        const submitted = ownedItems.filter((item) => item.status === 'submitted' && item.submitted_at);
        if (!submitted.length) return null;
        return submitted.sort((left, right) => {
            const leftTime = new Date(left.submitted_at as string).getTime();
            const rightTime = new Date(right.submitted_at as string).getTime();
            return rightTime - leftTime;
        })[0];
    }, [ownedItems]);

    const latestSubmittedId = latestSubmittedItem?.id;

    const loadLatestSubmitted = useCallback(async (submittedId: number) => {
        latestSubmittedControllerRef.current?.abort();
        const controller = new AbortController();
        latestSubmittedControllerRef.current = controller;
        const ownerId = riskId;
        const hasSafeStaleSummary = latestSubmittedRef.current?.id === submittedId;
        if (!hasSafeStaleSummary) {
            latestSubmittedRef.current = null;
            setLatestSubmitted(null);
            setLatestSubmittedOutcome('loading');
        }
        setLatestSubmittedLoading(true);
        try {
            const detail = await riskQuestionnairesApi.get(
                submittedId,
                { includePrevious: true },
                { signal: controller.signal },
            );
            if (
                controller.signal.aborted
                || latestSubmittedControllerRef.current !== controller
                || ownerRef.current !== ownerId
            ) return;
            latestSubmittedRef.current = detail;
            setLatestSubmitted(detail);
            setLatestSubmittedOutcome('content');
        } catch (error) {
            if (
                isAbortError(error)
                || controller.signal.aborted
                || latestSubmittedControllerRef.current !== controller
                || ownerRef.current !== ownerId
            ) return;
            if (isProtectedUnavailableError(error)) {
                latestSubmittedRef.current = null;
                setLatestSubmitted(null);
                setLatestSubmittedOutcome('denied');
                return;
            }
            setLatestSubmittedOutcome(hasSafeStaleSummary ? 'stale-with-error' : 'fatal-error');
        } finally {
            if (latestSubmittedControllerRef.current === controller && ownerRef.current === ownerId) {
                latestSubmittedControllerRef.current = null;
                setLatestSubmittedLoading(false);
            }
        }
    }, [riskId]);

    useEffect(() => {
        if (!latestSubmittedId) {
            latestSubmittedControllerRef.current?.abort();
            latestSubmittedControllerRef.current = null;
            latestSubmittedRef.current = null;
            setLatestSubmitted(null);
            setLatestSubmittedLoading(false);
            setLatestSubmittedOutcome('empty');
            return;
        }
        void loadLatestSubmitted(latestSubmittedId);
        return () => latestSubmittedControllerRef.current?.abort();
    }, [latestSubmittedId, latestSubmittedRefreshKey, loadLatestSubmitted]);

    const refresh = useCallback(async () => {
        refreshControllerRef.current?.abort();
        const controller = new AbortController();
        refreshControllerRef.current = controller;
        const ownerId = riskId;
        setLoading(true);
        setErrorKey(null);
        if (!hasSuccessfulLoadRef.current) {
            setLoadOutcome('initial-loading');
        }
        try {
            const data = await riskQuestionnairesApi.listForRisk(ownerId, { signal: controller.signal });
            if (controller.signal.aborted || ownerRef.current !== ownerId) return;
            itemsOwnerRef.current = ownerId;
            setItems(data);
            hasSuccessfulLoadRef.current = true;
            setLoadOutcome('content');
            setLatestSubmittedRefreshKey((current) => current + 1);
        } catch (error) {
            if (isAbortError(error) || controller.signal.aborted || ownerRef.current !== ownerId) return;
            setErrorKey(apiClient.toUiMessageKey(error));
            if (isProtectedUnavailableError(error)) {
                setItems([]);
                itemsOwnerRef.current = null;
                setSelectedId(null);
                latestSubmittedControllerRef.current?.abort();
                latestSubmittedRef.current = null;
                setLatestSubmitted(null);
                setLatestSubmittedLoading(false);
                setLatestSubmittedOutcome('empty');
                setLoadOutcome('denied');
                return;
            }
            setLoadOutcome(hasSuccessfulLoadRef.current ? 'stale-with-error' : 'fatal-error');
        } finally {
            if (!controller.signal.aborted && ownerRef.current === ownerId) {
                setLoading(false);
            }
        }
    }, [riskId]);

    useEffect(() => {
        refreshControllerRef.current?.abort();
        sendControllerRef.current?.abort();
        latestSubmittedControllerRef.current?.abort();
        hasSuccessfulLoadRef.current = false;
        itemsOwnerRef.current = null;
        latestSubmittedRef.current = null;
        setItems([]);
        setSelectedId(null);
        setLatestSubmitted(null);
        setLatestSubmittedLoading(false);
        setLatestSubmittedOutcome('empty');
        setLatestSubmittedRefreshKey(0);
        setLoadOutcome('initial-loading');
        setErrorKey(null);
        setMessage(null);
    }, [riskId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleSend = async () => {
        if (!canSend) return;
        sendControllerRef.current?.abort();
        const controller = new AbortController();
        sendControllerRef.current = controller;
        const ownerId = riskId;
        setMessage(null);
        setErrorKey(null);
        setSending(true);
        try {
            await riskQuestionnairesApi.sendForRisk(ownerId, { signal: controller.signal });
            if (controller.signal.aborted || ownerRef.current !== ownerId) return;
            setMessage(t('risks:questionnaires.send_success'));
            await refresh();
        } catch (error) {
            if (isAbortError(error) || controller.signal.aborted || ownerRef.current !== ownerId) return;
            const messageText = error instanceof Error ? error.message : '';
            if (messageText.toLowerCase().includes('open questionnaire already exists')) {
                setMessage(t('risks:questionnaires.send_open_exists'));
                await refresh();
                if (openItem) setSelectedId(openItem.id);
                return;
            }
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            if (!controller.signal.aborted && ownerRef.current === ownerId) {
                setSending(false);
            }
        }
    };

    return {
        errorKey,
        handleSend,
        items: ownedItems,
        latestSubmitted: latestSubmitted?.risk_id === riskId ? latestSubmitted : null,
        latestSubmittedLoading,
        latestSubmittedOutcome,
        refreshLatestSubmitted: () => latestSubmittedId && loadLatestSubmitted(latestSubmittedId),
        loadOutcome,
        loading,
        message,
        openItem,
        refresh,
        selectedId: itemsOwnerRef.current === riskId ? selectedId : null,
        sending,
        setSelectedId,
    };
}
