import { useCallback, useEffect, useMemo, useState } from 'react';
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

import {
    getTotalPages,
    useCollectionDataState,
    useLatestRequestGuard,
} from '../shared/collectionPageState';
import type { VendorSemanticFilters } from '../shared/ictRegisterSemanticFilters';
import {
    buildRegisterUrlParams,
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
    const [currentPage, setCurrentPage] = useState(1);
    const [facets, setFacets] = useState<VendorFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure,
        applySuccess,
        capabilities,
        errorKey,
        groups,
        hasLoadedOnce,
        isAccessDenied,
        isLoading,
        items,
        setErrorKey,
        setIsLoading,
        totalCount,
    } = useCollectionDataState<Vendor, VendorListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();

    const effectiveFilters = useMemo<VendorRegisterFilters>(() => ({
        ...filters,
        lifecycle: filters.lifecycle,
        tiers: semanticFilters.tier ? [semanticFilters.tier] : filters.tiers,
        has_roi_contract: semanticFilters.has_roi_contract ?? filters.has_roi_contract,
        has_sub_outsourcing: semanticFilters.has_sub_outsourcing ?? filters.has_sub_outsourcing,
        has_direct_process_link: semanticFilters.has_direct_process_link ?? filters.has_direct_process_link,
    }), [
        filters,
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

    const fetchVendors = useCallback(async () => {
        const currentRequest = beginRequest();
        setIsLoading(true);
        try {
            const response = await vendorApi.getVendors(listParams);
            if (!isCurrentRequest(currentRequest)) return;
            applySuccess({
                items: response.items,
                groups: response.groups ?? [],
                capabilities: response.capabilities ?? null,
                total: response.total,
            });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(currentRequest)) return;
            const patch = applyFailure(error, {
                clearOnNonForbidden: true,
                fallbackErrorKey: 'errors.load_failed',
                toErrorKey: apiClient.toUiMessageKey.bind(apiClient),
            });
            if (patch.items || patch.isAccessDenied) setFacets({});
        } finally {
            if (isCurrentRequest(currentRequest)) setIsLoading(false);
        }
    }, [applyFailure, applySuccess, beginRequest, isCurrentRequest, listParams, setIsLoading]);

    useEffect(() => setCurrentPage(1), [serializedParams]);
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
            search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? groupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort,
            view: next.view ?? viewMode,
        }, new URLSearchParams(serializedParams));
        setSearchParams(params, { replace });
        setCurrentPage(1);
    }, [filters, groupValue, serializedParams, setSearchParams, sort, urlState.search, viewMode]);

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
        try {
            await vendorApi.restoreVendor(vendorId);
            await fetchVendors();
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        }
    }, [fetchVendors, setErrorKey]);

    const exportVendors = useCallback(async () => {
        setIsExporting(true);
        try {
            await vendorApi.downloadExport({
                ...listParams,
                offset: 0,
                limit: DEFAULT_LIST_PAGE_SIZE,
                search: urlState.search.trim() || undefined,
            }, language);
        } catch (error) {
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsExporting(false);
        }
    }, [language, listParams, setErrorKey, urlState.search]);

    return {
        capabilities,
        clearFilters: () => writeUrl({ filters: parseVendorRegisterFilters({}), group: null }),
        clearSelectedGroup: () => writeUrl({ group: null }),
        currentPage,
        errorKey,
        exportVendors,
        facets,
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
