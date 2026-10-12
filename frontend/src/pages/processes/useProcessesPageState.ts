import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { type SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { processApi } from '@/services/processApi';
import type {
    Process,
    ProcessFacets,
    ProcessListCapabilities,
    ProcessPendingCreationRead,
    ProcessSortField,
} from '@/types/process';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import type { ProcessSemanticFilters } from '../shared/ictRegisterSemanticFilters';
import {
    getTotalPages,
    useCollectionDataState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';
import { useStableRegisterRequestParams } from '../shared/useStableRegisterRequestParams';
import { useCommittedRegisterQuery, useRegisterUrlWorkingSet } from '../shared/useRegisterUrlWorkingSet';
import { useRestoreWithFeedback } from '../shared/useRestoreWithFeedback';
import {
    buildProcessRegisterListParams,
    parseProcessRegisterFilters,
    PROCESS_REGISTER_CONFIG,
    serializeProcessRegisterFilters,
    type ProcessRegisterFilters,
} from './processRegisterConfig';

const PROCESS_VIEWS = PROCESS_REGISTER_CONFIG.views.map(({ value }) => value);
const PROCESS_SORT_FIELDS: readonly ProcessSortField[] = ['f_code', 'l0_area', 'l1_process', 'owner', 'created_at'];

function labelsForSelectedGroup(groups: Array<{ value: string; label: string }>, value: string | null) {
    if (!value) return null;
    return groups.find((group) => group.value === value)?.label ?? null;
}

const processUrlOptions = {
    allowedViews: PROCESS_VIEWS,
    allowedSortFields: PROCESS_SORT_FIELDS,
    parseFilters: parseProcessRegisterFilters,
    serializeFilters: serializeProcessRegisterFilters,
};

export function useProcessesPageState(
    semanticFilters: ProcessSemanticFilters = {},
    language: SupportedLanguage = 'en',
) {
    const departmentScope = useDepartmentRegisterScope();
    const workingSet = useRegisterUrlWorkingSet(processUrlOptions);
    const { currentPage, debouncedSearch, filters, selectedGroupValue, sort, viewMode, writeUrl } = workingSet;
    const [facets, setFacets] = useState<ProcessFacets>({});
    const [pendingCreations, setPendingCreations] = useState<ProcessPendingCreationRead[]>([]);
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
    } = useCollectionDataState<Process, ProcessListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const runRowRestore = useRestoreWithFeedback();

    const effectiveFilters = useMemo<ProcessRegisterFilters>(() => ({
        ...filters,
        department_ids: departmentScope ? [departmentScope.departmentId] : filters.department_ids,
        cif: semanticFilters.cif === true ? true : filters.cif,
    }), [departmentScope, filters, semanticFilters.cif]);

    const requestParams = useMemo(() => buildProcessRegisterListParams({
        currentPage,
        filters: effectiveFilters,
        groupValue: selectedGroupValue,
        limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch,
        sort,
        view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, selectedGroupValue, sort, viewMode]);
    const listParams = useStableRegisterRequestParams(requestParams);
    const { queryIdentity, getExportParams } = useCommittedRegisterQuery(listParams, commitQueryIdentity);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};
    const visiblePendingCreations = queryState.isCurrentQuery ? pendingCreations : [];

    const fetchProcesses = useCallback(async () => {
        const currentRequest = beginRequest();
        if (!beginQuery(queryIdentity)) {
            setFacets({});
            setPendingCreations([]);
        }
        setIsLoading(true);
        try {
            const response = await processApi.getProcesses(listParams);
            if (!isCurrentRequest(currentRequest)) return;
            applySuccess(queryIdentity, {
                items: response.items,
                groups: response.groups ?? [],
                capabilities: response.capabilities ?? null,
                total: response.total,
            });
            setFacets(response.facets ?? {});
            setPendingCreations(response.pending_creations);
        } catch (error) {
            if (!isCurrentRequest(currentRequest)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) {
                setFacets({});
                setPendingCreations([]);
            }
        } finally {
            if (isCurrentRequest(currentRequest)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => {
        void fetchProcesses();
    }, [fetchProcesses]);

    const updateFilter = useCallback(<K extends keyof ProcessRegisterFilters>(key: K, value: ProcessRegisterFilters[K]) => {
        writeUrl({ filters: { ...filters, [key]: value }, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(() => writeUrl({
        filters: parseProcessRegisterFilters({}),
        group: null,
    }), [writeUrl]);

    // D9 / FB-01: a row restore reports through a toast and never flips the
    // register into its error state.
    const restoreProcess = useCallback(async (processId: number) => {
        const restoreQueryIdentity = queryIdentity;
        await runRowRestore({
            restore: () => processApi.restoreProcess(processId),
            name: items.find((item) => item.id === processId)?.l1_process,
            refresh: async () => {
                if (isQueryCurrent(restoreQueryIdentity)) await fetchProcesses();
            },
        });
    }, [fetchProcesses, isQueryCurrent, items, queryIdentity, runRowRestore]);

    const exportProcesses = useCallback(async () => {
        setIsExporting(true);
        try {
            await processApi.downloadExport(getExportParams(), language);
        } finally {
            setIsExporting(false);
        }
    }, [getExportParams, language]);

    return {
        ...workingSet,
        capabilities, errorKey, facets: visibleFacets, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        selectedGroupLabel: labelsForSelectedGroup(groups, selectedGroupValue),
        clearFilters, exportProcesses, fetchProcesses, restoreProcess,
        pendingCreations: visiblePendingCreations,
    };
}
