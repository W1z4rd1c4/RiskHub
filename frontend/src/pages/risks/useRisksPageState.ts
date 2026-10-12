import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useFeedback } from '@/hooks/useFeedback';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import type { SupportedLanguage } from '@/i18n';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';
import { reportApi } from '@/services/reportApi';
import { riskApi } from '@/services/riskApi';
import type { RiskFacets, RiskListCapabilities, RiskSummary } from '@/types/risk';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import type { RiskSemanticFilters } from '../shared/ictRegisterSemanticFilters';
import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import type { RegisterFilters } from '../shared/registerListQuery';
import { useCommittedRegisterQuery, useRegisterUrlWorkingSet } from '../shared/useRegisterUrlWorkingSet';
import {
    buildRiskRegisterListParams,
    EMPTY_RISK_REGISTER_FILTERS,
    parseRiskRegisterFilters,
    RISK_REGISTER_CONFIG,
    riskSnapshotUnsupportedCriteria,
    serializeRiskRegisterFilters,
    type RiskRegisterFilters,
} from './riskRegisterConfig';
import { normalizeRiskSummaries } from './risksPagePresentation';

const RISK_VIEWS = RISK_REGISTER_CONFIG.views.map(({ value }) => value);
const RISK_SORT_FIELDS = [
    'name', 'description', 'status', 'risk_id_code', 'category', 'risk_type',
    'gross_score', 'net_score', 'kri_count', 'control_count',
] as const;

function selectedGroupLabel(groups: Array<{ value: string; label: string }>, value: string | null) {
    return value ? groups.find((group) => group.value === value)?.label ?? null : null;
}

const riskUrlOptions = {
    allowedViews: RISK_VIEWS,
    allowedSortFields: RISK_SORT_FIELDS,
    parseFilters: parseRiskRegisterFilters,
    serializeFilters: serializeRiskRegisterFilters,
    readFilters: (raw: RegisterFilters, params: URLSearchParams) => {
        const parsed = parseRiskRegisterFilters(raw);
        return {
            ...parsed,
            critical: raw.critical === undefined && params.get('critical') === 'true' ? true : parsed.critical,
            has_breach: raw.has_breach === undefined && params.get('breached') === 'true' ? true : parsed.has_breach,
        };
    },
    cleanWriteParams: (params: URLSearchParams) => { params.delete('critical'); params.delete('breached'); },
};

export function useRisksPageState(
    semanticFilters: RiskSemanticFilters = {},
    language: SupportedLanguage = 'en',
) {
    const departmentScope = useDepartmentRegisterScope();
    const { thresholds } = useRiskThresholds();
    const { t } = useTranslation('risks');
    const feedback = useFeedback();
    const workingSet = useRegisterUrlWorkingSet(riskUrlOptions);
    const { currentPage, debouncedSearch, filters, selectedGroupValue: groupValue, sort, viewMode, writeUrl } = workingSet;
    const [facets, setFacets] = useState<RiskFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, beginQuery, commitQueryIdentity, forQuery,
        isLoading: collectionIsLoading, isQueryCurrent, setIsLoading,
    } = useCollectionDataState<RiskSummary, RiskListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const listParams = useMemo(() => {
        const { committee_scope: committeeScope, ...rawApiSemanticFilters } = semanticFilters;
        const apiSemanticFilters = Object.fromEntries(
            Object.entries(rawApiSemanticFilters).filter(([, value]) => value !== undefined),
        );
        const effectiveFilters = committeeScope === true
            ? { ...filters, lifecycle: 'all' as const, status: '' as const }
            : filters;
        return {
            ...buildRiskRegisterListParams({
                criticalMinNetScore: thresholds.critical,
                currentPage,
                filters: effectiveFilters,
                groupValue,
                limit: DEFAULT_LIST_PAGE_SIZE,
                search: debouncedSearch,
                sort,
                view: viewMode,
            }),
            ...apiSemanticFilters,
            department_id: departmentScope?.departmentId,
        };
    }, [currentPage, debouncedSearch, departmentScope?.departmentId, filters, groupValue, semanticFilters, sort, thresholds.critical, viewMode]);
    const configuredRangeIdentity = filters.risk_level || filters.critical
        ? [thresholds.medium, thresholds.high, thresholds.critical]
        : null;
    const { queryIdentity, getExportParams } = useCommittedRegisterQuery(listParams, commitQueryIdentity, configuredRangeIdentity);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};

    const fetchRisks = useCallback(async () => {
        const request = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await riskApi.getRisks(listParams);
            if (!isCurrentRequest(request)) return;
            applySuccess(queryIdentity, {
                items: normalizeRiskSummaries(response.items),
                groups: response.groups ?? [],
                capabilities: response.capabilities ?? null,
                total: response.total,
            });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(request)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) setFacets({});
        } finally {
            if (isCurrentRequest(request)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => { void fetchRisks(); }, [fetchRisks]);

    const updateFilter = useCallback(<K extends keyof RiskRegisterFilters>(key: K, value: RiskRegisterFilters[K]) => {
        writeUrl({ filters: { ...filters, [key]: value }, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(
        () => writeUrl({ filters: EMPTY_RISK_REGISTER_FILTERS, group: null }),
        [writeUrl],
    );
    // D9 / FB-01: the outcome of a row restore is a toast. A failure never puts
    // the register into its error state (the rows stay usable), and the user is
    // told even when they have already moved to another page of the register.
    const restoreRisk = useCallback(async (riskId: number) => {
        const restoreQueryIdentity = queryIdentity;
        try {
            await riskApi.restoreRisk(riskId);
        } catch (error) {
            feedback.error({ title: t('messages.restore_failed'), messageKey: apiClient.toUiMessageKey(error) });
            return;
        }
        feedback.success({ title: t('messages.restore_success') });
        if (isQueryCurrent(restoreQueryIdentity)) await fetchRisks();
    }, [feedback, fetchRisks, isQueryCurrent, queryIdentity, t]);
    const exportCurrentRisks = useCallback(async () => {
        setIsExporting(true);
        try {
            await riskApi.downloadExport(getExportParams(), language);
        }
        finally { setIsExporting(false); }
    }, [getExportParams, language]);
    const unsupportedSnapshotCriteria = riskSnapshotUnsupportedCriteria(filters, groupValue);
    const snapshotUnavailableReason = unsupportedSnapshotCriteria.length
        ? t('register.snapshot_unavailable', { criteria: unsupportedSnapshotCriteria.map((key) => t(key)).join(', ') })
        : undefined;
    const exportRiskSnapshot = useCallback(async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        if (snapshotUnavailableReason) throw new Error(snapshotUnavailableReason);
        setIsExporting(true);
        try {
            await reportApi.exportRisks({
                format,
                asOfDate,
                filters: {
                    departmentId: listParams.department_id,
                    lifecycle: listParams.lifecycle,
                    status: listParams.status || null,
                    search: listParams.search || null,
                    riskType: listParams.risk_type || null,
                    isPriority: listParams.is_priority ?? null,
                },
            });
        }
        finally { setIsExporting(false); }
    }, [listParams, snapshotUnavailableReason]);

    return {
        ...workingSet,
        capabilities, errorKey, facets: visibleFacets, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        selectedGroupLabel: selectedGroupLabel(groups, groupValue),
        clearFilters, exportCurrentRisks, exportRiskSnapshot, fetchRisks, restoreRisk, snapshotUnavailableReason,
    };
}
