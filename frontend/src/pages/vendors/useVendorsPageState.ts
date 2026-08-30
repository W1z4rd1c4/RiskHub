import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortDirection } from '@/components/tables';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
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
import {
    buildRegisterUrlParams,
    normalizeRegisterUrlParams,
    parseRegisterUrlState,
    type RegisterSortState,
} from '../shared/registerListQuery';
import {
    buildVendorRegisterListParams,
    parseVendorRegisterFilters,
    serializeVendorRegisterFilters,
    VENDOR_REGISTER_CONFIG,
    type VendorLifecycleFilter,
    type VendorRegisterFilters,
    type VendorRegisterView,
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

const validSort = (sort: RegisterSortState | null) => (
    sort && VENDOR_SORT_FIELDS.includes(sort.field as VendorSortField) ? sort : null
);
const selectedGroupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => (
    value ? groups.find((group) => group.value === value)?.label ?? null : null
);

export function useVendorsPageState(
    semanticFilters: VendorSemanticFilters = {},
    language: SupportedLanguage = 'en',
) {
    const departmentScope = useDepartmentRegisterScope();
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(new URLSearchParams(serializedParams), {
        defaultView: 'all',
        allowedViews: VENDOR_VIEWS,
    }), [serializedParams]);
    const filters = useMemo(() => parseVendorRegisterFilters(urlState.filters), [urlState.filters]);
    const viewMode = urlState.view as VendorRegisterView;
    const sort = validSort(urlState.sort);
    const groupValue = urlState.selectedGroupValue;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);
    const currentPage = urlState.page;
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
        setErrorKey,
        setIsLoading,
    } = useCollectionDataState<Vendor, VendorListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

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

    const listParams = useMemo(() => buildVendorRegisterListParams({
        currentPage,
        filters: effectiveFilters,
        groupValue,
        limit: DEFAULT_LIST_PAGE_SIZE,
        search: debouncedSearch,
        sort,
        view: viewMode,
    }), [currentPage, debouncedSearch, effectiveFilters, groupValue, sort, viewMode]);
    const queryIdentity = JSON.stringify(listParams);
    useLayoutEffect(() => commitQueryIdentity(queryIdentity), [commitQueryIdentity, queryIdentity]);
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
                fallbackErrorKey: 'errors.load_failed',
                toErrorKey: apiClient.toUiMessageKey.bind(apiClient),
            });
            if (patch.isAccessDenied) setFacets({});
        } finally {
            if (isCurrentRequest(currentRequest)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => {
        const params = new URLSearchParams(serializedParams);
        if (!normalizeRegisterUrlParams(params, {
            allowedSortFields: VENDOR_SORT_FIELDS,
            allowedViews: VENDOR_VIEWS,
            canonicalizeFilters: (rawFilters) => serializeVendorRegisterFilters(parseVendorRegisterFilters(rawFilters)),
            defaultView: 'all',
        })) return;
        setSearchParams(params, { replace: true });
    }, [serializedParams, setSearchParams]);
    useEffect(() => { void fetchVendors(); }, [fetchVendors]);

    const writeUrl = useCallback((next: {
        filters?: VendorRegisterFilters;
        group?: string | null;
        search?: string;
        sort?: RegisterSortState | null;
        view?: VendorRegisterView;
    }, replace = false) => {
        const params = buildRegisterUrlParams({
            filters: serializeVendorRegisterFilters(next.filters ?? filters),
            page: 1,
            search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? groupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort,
            view: next.view ?? viewMode,
        }, new URLSearchParams(serializedParams));
        setSearchParams(params, { replace });
    }, [filters, groupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);

    const setCurrentPage = useCallback((page: number) => {
        const params = new URLSearchParams(serializedParams);
        if (page > 1) params.set('page', String(page));
        else params.delete('page');
        setSearchParams(params);
    }, [serializedParams, setSearchParams]);

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

    const restoreVendor = useCallback(async (vendorId: number) => {
        const restoreQueryIdentity = queryIdentity;
        try {
            await vendorApi.restoreVendor(vendorId);
            if (isQueryCurrent(restoreQueryIdentity)) await fetchVendors();
        } catch (error) {
            if (isQueryCurrent(restoreQueryIdentity)) setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchVendors, isQueryCurrent, queryIdentity, setErrorKey]);

    const exportVendors = useCallback(async () => {
        setIsExporting(true);
        try {
            await vendorApi.downloadExport({
                ...listParams,
                offset: 0,
                limit: DEFAULT_LIST_PAGE_SIZE,
                search: urlState.search.trim() || undefined,
            }, language);
        } finally {
            setIsExporting(false);
        }
    }, [language, listParams, urlState.search]);

    return {
        capabilities,
        clearFilters: () => writeUrl({ filters: parseVendorRegisterFilters({}), group: null }),
        clearSelectedGroup: () => writeUrl({ group: null }),
        currentPage,
        errorKey,
        exportVendors,
        facets: visibleFacets,
        fetchVendors,
        filters,
        groups,
        hasLoadedOnce,
        isAccessDenied,
        isExporting,
        isLoading,
        items,
        limit: DEFAULT_LIST_PAGE_SIZE,
        restoreVendor,
        search: urlState.search,
        selectGroup: (value: string, _label?: string) => writeUrl({ group: value }),
        selectedGroupLabel: selectedGroupLabel(groups, groupValue),
        selectedGroupValue: groupValue,
        setCurrentPage,
        sortDirection: sort?.direction ?? null,
        sortField: (sort?.field as VendorSortField | undefined) ?? null,
        statusFilter: filters.lifecycle,
        totalCount,
        totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE),
        updateFilter,
        updateSearch: (value: string) => writeUrl({ search: value, group: null }, true),
        updateSort: (field: VendorSortField | null, direction: SortDirection) => (
            writeUrl({ sort: field && direction ? { field, direction } : null })
        ),
        updateStatusFilter: (value: VendorLifecycleFilter) => updateFilter('lifecycle', value),
        updateViewMode: (view: VendorRegisterView) => writeUrl({ group: null, view }),
        viewMode,
    };
}
