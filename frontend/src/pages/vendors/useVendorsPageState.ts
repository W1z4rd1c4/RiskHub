import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import type { SupportedLanguage } from '@/i18n';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { apiClient } from '@/services/apiClient';
import { vendorApi } from '@/services/vendorApi';
import type {
    Vendor,
    VendorFacets,
    VendorListCapabilities,
    VendorSortField,
} from '@/types/vendor';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import {
    getTotalPages,
    useCollectionDataState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';
import type { VendorSemanticFilters } from '../shared/ictRegisterSemanticFilters';
import { useStableRegisterRequestParams } from '../shared/useStableRegisterRequestParams';
import { useCommittedRegisterQuery, useRegisterUrlWorkingSet } from '../shared/useRegisterUrlWorkingSet';
import { useRestoreWithFeedback } from '../shared/useRestoreWithFeedback';
import {
    buildVendorRegisterListParams,
    parseVendorRegisterFilters,
    serializeVendorRegisterFilters,
    VENDOR_REGISTER_CONFIG,
    type VendorRegisterFilters,
} from './vendorRegisterConfig';

const VENDOR_VIEWS = VENDOR_REGISTER_CONFIG.views.map(({ value }) => value);
const VENDOR_SORT_FIELDS: readonly VendorSortField[] = [
    'name',
    'legal_name',
    'registration_id',
    'department',
    'outsourcing_owner',
    'vendor_type',
    'risk_score',
    'tier',
    'cif',
    'process',
    'country',
    'created_at',
];

const selectedGroupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => (
    value ? groups.find((group) => group.value === value)?.label ?? null : null
);

const vendorUrlOptions = {
    allowedViews: VENDOR_VIEWS,
    allowedSortFields: VENDOR_SORT_FIELDS,
    parseFilters: parseVendorRegisterFilters,
    serializeFilters: serializeVendorRegisterFilters,
};

export function useVendorsPageState(
    semanticFilters: VendorSemanticFilters = {},
    language: SupportedLanguage = 'en',
) {
    const departmentScope = useDepartmentRegisterScope();
    const workingSet = useRegisterUrlWorkingSet(vendorUrlOptions);
    const { currentPage, debouncedSearch, filters, selectedGroupValue: groupValue, sort, viewMode, writeUrl } = workingSet;
    const [facets, setFacets] = useState<VendorFacets>({});
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
    } = useCollectionDataState<Vendor, VendorListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const runRowRestore = useRestoreWithFeedback();

    const effectiveFilters = useMemo<VendorRegisterFilters>(() => ({
        ...filters,
        department_ids: departmentScope ? [departmentScope.departmentId] : filters.department_ids,
        lifecycle: semanticFilters.committee_scope === true ? 'all' : filters.lifecycle,
        tiers: semanticFilters.tier ? [semanticFilters.tier] : filters.tiers,
        has_roi_contract: semanticFilters.has_roi_contract ?? filters.has_roi_contract,
        has_sub_outsourcing: semanticFilters.has_sub_outsourcing ?? filters.has_sub_outsourcing,
        has_direct_process_link: semanticFilters.has_direct_process_link ?? filters.has_direct_process_link,
    }), [
        departmentScope,
        filters,
        semanticFilters.committee_scope,
        semanticFilters.has_direct_process_link,
        semanticFilters.has_roi_contract,
        semanticFilters.has_sub_outsourcing,
        semanticFilters.tier,
    ]);

    const requestParams = useMemo(() => buildVendorRegisterListParams({
        currentPage,
        filters: effectiveFilters,
        groupValue,
        limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch,
        sort,
        view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, groupValue, sort, viewMode]);
    const listParams = useStableRegisterRequestParams(requestParams);
    const { queryIdentity, getExportParams } = useCommittedRegisterQuery(listParams, commitQueryIdentity);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};

    const fetchVendors = useCallback(async () => {
        const currentRequest = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await vendorApi.getVendors(listParams);
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
            const patch = applyFailure(error, {
                toErrorKey: apiClient.toUiMessageKey.bind(apiClient),
            });
            if (patch.isAccessDenied) setFacets({});
        } finally {
            if (isCurrentRequest(currentRequest)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => { void fetchVendors(); }, [fetchVendors]);

    useEffect(() => {
        if (
            capabilities !== null
            && !resolveCapabilityFlag(capabilities, 'can_view_risk_contexts')
            && viewMode === 'risk'
        ) {
            writeUrl({ group: null, view: 'all' }, true);
        }
    }, [capabilities, viewMode, writeUrl]);

    const updateFilter = useCallback(<K extends keyof VendorRegisterFilters>(
        key: K,
        value: VendorRegisterFilters[K],
    ) => writeUrl({ filters: { ...filters, [key]: value }, group: null }), [filters, writeUrl]);

    // D9 / FB-01: a row restore reports through a toast and never flips the
    // register into its error state.
    const restoreVendor = useCallback(async (vendorId: number) => {
        const restoreQueryIdentity = queryIdentity;
        await runRowRestore({
            restore: () => vendorApi.restoreVendor(vendorId),
            name: items.find((item) => item.id === vendorId)?.name,
            refresh: async () => {
                if (isQueryCurrent(restoreQueryIdentity)) await fetchVendors();
            },
        });
    }, [fetchVendors, isQueryCurrent, items, queryIdentity, runRowRestore]);

    const exportVendors = useCallback(async () => {
        setIsExporting(true);
        try {
            await vendorApi.downloadExport(getExportParams(), language);
        } finally {
            setIsExporting(false);
        }
    }, [getExportParams, language]);

    return {
        workingSet,
        capabilities, errorKey, facets: visibleFacets, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        selectedGroupLabel: selectedGroupLabel(groups, groupValue),
        exportVendors, fetchVendors, restoreVendor,
        clearFilters: () => writeUrl({ filters: parseVendorRegisterFilters({}), group: null }),
    };
}
