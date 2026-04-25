import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/services/apiClient';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import type { RiskQuestionnaireDetail, RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import type { TranslateFn } from './risk-questionnaire-detail/questionnairePresentation';

interface UseRiskQuestionnairesTabDataParams {
    canSend: boolean;
    riskId: number;
    t: TranslateFn;
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

    const openItem = useMemo(
        () => items.find((item) => item.status === 'sent' || item.status === 'in_progress') ?? null,
        [items],
    );

    const latestSubmittedItem = useMemo(() => {
        const submitted = items.filter((item) => item.status === 'submitted' && item.submitted_at);
        if (!submitted.length) return null;
        return submitted.sort((left, right) => {
            const leftTime = new Date(left.submitted_at as string).getTime();
            const rightTime = new Date(right.submitted_at as string).getTime();
            return rightTime - leftTime;
        })[0];
    }, [items]);

    const latestSubmittedId = latestSubmittedItem?.id;

    useEffect(() => {
        let cancelled = false;
        const loadLatest = async () => {
            if (!latestSubmittedId) {
                setLatestSubmitted(null);
                return;
            }
            setLatestSubmittedLoading(true);
            try {
                const detail = await riskQuestionnairesApi.get(latestSubmittedId, { includePrevious: true });
                if (cancelled) return;
                setLatestSubmitted(detail);
            } catch {
                if (cancelled) return;
                setLatestSubmitted(null);
            } finally {
                if (!cancelled) setLatestSubmittedLoading(false);
            }
        };
        void loadLatest();
        return () => {
            cancelled = true;
        };
    }, [latestSubmittedId]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setErrorKey(null);
        try {
            const data = await riskQuestionnairesApi.listForRisk(riskId);
            setItems(data);
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setLoading(false);
        }
    }, [riskId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleSend = async () => {
        if (!canSend) return;
        setMessage(null);
        setErrorKey(null);
        setSending(true);
        try {
            await riskQuestionnairesApi.sendForRisk(riskId);
            setMessage(t('risks:questionnaires.send_success'));
            await refresh();
        } catch (error) {
            const messageText = error instanceof Error ? error.message : '';
            if (messageText.toLowerCase().includes('open questionnaire already exists')) {
                setMessage(t('risks:questionnaires.send_open_exists'));
                await refresh();
                if (openItem) setSelectedId(openItem.id);
                return;
            }
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setSending(false);
        }
    };

    return {
        errorKey,
        handleSend,
        items,
        latestSubmitted,
        latestSubmittedLoading,
        loading,
        message,
        openItem,
        refresh,
        selectedId,
        sending,
        setSelectedId,
    };
}
