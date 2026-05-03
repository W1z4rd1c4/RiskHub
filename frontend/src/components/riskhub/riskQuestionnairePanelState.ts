import { useCallback, useMemo, useState } from 'react';

import { apiClient } from '@/services/apiClient';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
import { riskHubApi } from '@/services/riskHubApi';
import type { RiskSummary, RiskStatus } from '@/types/risk';

export type BatchSendResponse = {
    created_count: number;
    skipped_no_owner: number[];
    skipped_open_exists: number[];
    errors: string[];
};

export interface RiskQuestionnaireFilters {
    department_id?: number;
    process?: string;
    category?: string;
    status?: RiskStatus;
}

export function useRiskQuestionnaireFilters() {
    const [departmentId, setDepartmentId] = useState<string>('');
    const [process, setProcess] = useState('');
    const [category, setCategory] = useState('');
    const [status, setStatus] = useState<RiskStatus | ''>('active');

    const filters = useMemo<RiskQuestionnaireFilters>(() => {
        return {
            department_id: departmentId ? Number(departmentId) : undefined,
            process: process.trim() || undefined,
            category: category.trim() || undefined,
            status: status || undefined,
        };
    }, [category, departmentId, process, status]);

    return {
        category,
        departmentId,
        filters,
        process,
        setCategory,
        setDepartmentId,
        setProcess,
        setStatus,
        status,
    };
}

export function useRiskQuestionnaireSelection(risks: RiskSummary[]) {
    const [selectAll, setSelectAll] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const toggleRisk = useCallback((id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAllVisible = useCallback(() => {
        if (selectAll) return;
        const allIds = risks.map((risk) => risk.id);
        const allSelected = allIds.every((id) => selectedIds.has(id));
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allSelected) {
                allIds.forEach((id) => next.delete(id));
            } else {
                allIds.forEach((id) => next.add(id));
            }
            return next;
        });
    }, [risks, selectAll, selectedIds]);

    const updateSelectAll = useCallback((checked: boolean) => {
        setSelectAll(checked);
        setSelectedIds(new Set());
    }, []);

    return {
        allVisibleSelected: risks.length > 0 && risks.every((risk) => selectedIds.has(risk.id)),
        selectedIds,
        selectAll,
        setSelectedIds,
        toggleAllVisible,
        toggleRisk,
        updateSelectAll,
    };
}

export function useRiskQuestionnaireRisks(filters: RiskQuestionnaireFilters) {
    const [loading, setLoading] = useState(false);
    const [risks, setRisks] = useState<RiskSummary[]>([]);

    const fetchRisks = useCallback(
        async (onBeforeLoad?: () => void, onError?: (errorKey: string) => void) => {
            setLoading(true);
            onBeforeLoad?.();
            try {
                const response = await riskApi.getRisks({
                    offset: 0,
                    limit: 50,
                    department_id: filters.department_id,
                    process: filters.process,
                    category: filters.category,
                    status: filters.status,
                    include_archived: false,
                });
                setRisks(response.items);
            } catch (error) {
                onError?.('errors.failed_to_load');
                logError('Failed to load questionnaire risks.', error);
            } finally {
                setLoading(false);
            }
        },
        [filters.category, filters.department_id, filters.process, filters.status]
    );

    return {
        fetchRisks,
        loading,
        risks,
    };
}

export function useRiskQuestionnaireBatchSend({
    fetchRisks,
    filters,
    selectedIds,
    selectAll,
    setSelectedIds,
    setErrorKey,
    setResult,
}: {
    fetchRisks: () => Promise<void>;
    filters: RiskQuestionnaireFilters;
    selectedIds: Set<number>;
    selectAll: boolean;
    setSelectedIds: (selectedIds: Set<number>) => void;
    setErrorKey: (errorKey: string | null) => void;
    setResult: (result: BatchSendResponse | null) => void;
}) {
    const [sending, setSending] = useState(false);

    const handleBatchSend = useCallback(async () => {
        setSending(true);
        setErrorKey(null);
        setResult(null);
        try {
            const payload = selectAll
                ? {
                    select_all: true,
                    filters,
                }
                : {
                    select_all: false,
                    risk_ids: Array.from(selectedIds),
                };

            if (!selectAll && selectedIds.size === 0) {
                setErrorKey('riskhub.questionnaires.select_some');
                return;
            }

            const response = await riskHubApi.batchSendQuestionnaires(payload);
            setResult(response);
            setSelectedIds(new Set());
            await fetchRisks();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setSending(false);
        }
    }, [fetchRisks, filters, selectAll, selectedIds, setErrorKey, setResult, setSelectedIds]);

    return {
        handleBatchSend,
        sending,
    };
}
