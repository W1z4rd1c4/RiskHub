import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { threatApi } from '@/services/threatApi';
import type { ThreatFacets, ThreatListCapabilities, ThreatListItem, ThreatSortField } from '@/types/threat';

import {
    getTotalPages,
    useCollectionDataState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';
import { useStableRegisterRequestParams } from '../shared/useStableRegisterRequestParams';
import { useCommittedRegisterQuery, useRegisterUrlWorkingSet } from '../shared/useRegisterUrlWorkingSet';
import { useRestoreWithFeedback } from '../shared/useRestoreWithFeedback';
import {
    buildThreatRegisterListParams,
    parseThreatRegisterFilters,
    serializeThreatRegisterFilters,
    THREAT_REGISTER_CONFIG,
    type ThreatRegisterFilters,
} from './threatRegisterConfig';

const THREAT_VIEWS = THREAT_REGISTER_CONFIG.views.map(({ value }) => value);
const THREAT_SORT_FIELDS: readonly ThreatSortField[] = [
    'name',
    'category',
    'threat_steward',
    'relevant_subject',
    'linked_risk_count',
    'created_at',
];

const selectedGroupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => (
    value ? groups.find((group) => group.value === value)?.label ?? null : null
);

const threatUrlOptions = {
    allowedViews: THREAT_VIEWS,
    allowedSortFields: THREAT_SORT_FIELDS,
    parseFilters: parseThreatRegisterFilters,
    serializeFilters: serializeThreatRegisterFilters,
};

export function useThreatsPageState(language: SupportedLanguage = 'en') {
    const workingSet = useRegisterUrlWorkingSet(threatUrlOptions);
    const { currentPage, debouncedSearch, filters, selectedGroupValue: groupValue, sort, viewMode, writeUrl } = workingSet;
    const [facets, setFacets] = useState<ThreatFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure,
        applySuccess,
        beginQuery,
        commitQueryIdentity,
        forQuery,
        isLoading: collectionIsLoading,
        isQueryCurrent,
        setIsLoading,
    } = useCollectionDataState<ThreatListItem, ThreatListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const runRowRestore = useRestoreWithFeedback();

    const requestParams = useMemo(() => buildThreatRegisterListParams({
        currentPage,
        filters,
        groupValue,
        limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch,
        sort,
        view: viewMode,
    }), [currentPage, debouncedSearch, filters, groupValue, sort, viewMode]);
    const listParams = useStableRegisterRequestParams(requestParams);
    const { queryIdentity, getExportParams } = useCommittedRegisterQuery(listParams, commitQueryIdentity);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};

    const fetchThreats = useCallback(async () => {
        const currentRequest = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await threatApi.getThreats(listParams);
            if (!isCurrentRequest(currentRequest)) return;
            applySuccess(queryIdentity, {
                items: response.items,
                groups: response.groups ?? [],
                capabilities: response.capabilities ?? null,
                total: response.total,
            });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(currentRequest)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) setFacets({});
        } finally {
            if (isCurrentRequest(currentRequest)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => { void fetchThreats(); }, [fetchThreats]);

    const updateFilter = useCallback(<K extends keyof ThreatRegisterFilters>(
        key: K,
        value: ThreatRegisterFilters[K],
    ) => writeUrl({ filters: { ...filters, [key]: value }, group: null }), [filters, writeUrl]);

    // D9 / FB-01: a row restore reports through a toast and never flips the
    // register into its error state.
    const restoreThreat = useCallback(async (threatId: number) => {
        const restoreQueryIdentity = queryIdentity;
        await runRowRestore({
            restore: () => threatApi.restoreThreat(threatId),
            name: items.find((item) => item.id === threatId)?.name,
            refresh: async () => {
                if (isQueryCurrent(restoreQueryIdentity)) await fetchThreats();
            },
        });
    }, [fetchThreats, isQueryCurrent, items, queryIdentity, runRowRestore]);

    const exportThreats = useCallback(async () => {
        setIsExporting(true);
        try {
            await threatApi.downloadExport(getExportParams(), language);
        } finally {
            setIsExporting(false);
        }
    }, [getExportParams, language]);

    return {
        ...workingSet,
        capabilities, errorKey, facets: visibleFacets, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        selectedGroupLabel: selectedGroupLabel(groups, groupValue),
        exportThreats, fetchThreats, restoreThreat,
        clearFilters: () => writeUrl({ filters: parseThreatRegisterFilters({}), group: null }),
    };
}
