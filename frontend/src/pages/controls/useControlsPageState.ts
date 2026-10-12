import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useTranslation } from '@/i18n/hooks';
import type { SupportedLanguage } from '@/i18n';
import { apiClient } from '@/services/apiClient';
import { controlApi } from '@/services/controlApi';
import { reportApi } from '@/services/reportApi';
import type { ControlFacets, ControlListCapabilities, ControlSummary } from '@/types/control';

import { useDepartmentRegisterScope } from '../departments/useDepartmentRegisterScope';
import { getTotalPages, useCollectionDataState, useLatestRequestGuard } from '../shared/collectionPageState';
import { useStableRegisterRequestParams } from '../shared/useStableRegisterRequestParams';
import { useCommittedRegisterQuery, useRegisterUrlWorkingSet } from '../shared/useRegisterUrlWorkingSet';
import { useRestoreWithFeedback } from '../shared/useRestoreWithFeedback';
import {
    buildControlRegisterListParams,
    CONTROL_REGISTER_CONFIG,
    controlSnapshotUnsupportedForm,
    parseControlRegisterFilters,
    serializeControlRegisterFilters,
    type ControlRegisterFilters,
} from './controlRegisterConfig';

const CONTROL_VIEWS = CONTROL_REGISTER_CONFIG.views.map(({ value }) => value);
const CONTROL_SORT_FIELDS = ['name', 'department', 'frequency', 'risk_level', 'status', 'control_form'] as const;
const groupLabel = (groups: Array<{ value: string; label: string }>, value: string | null) => value ? groups.find((group) => group.value === value)?.label ?? null : null;

const controlUrlOptions = {
    allowedViews: CONTROL_VIEWS,
    allowedSortFields: CONTROL_SORT_FIELDS,
    parseFilters: parseControlRegisterFilters,
    serializeFilters: serializeControlRegisterFilters,
};

export function useControlsPageState(language: SupportedLanguage = 'en') {
    const departmentScope = useDepartmentRegisterScope();
    const { t } = useTranslation('controls');
    const workingSet = useRegisterUrlWorkingSet(controlUrlOptions);
    const { currentPage, debouncedSearch, filters, selectedGroupValue, sort, viewMode, writeUrl } = workingSet;
    const [facets, setFacets] = useState<ControlFacets>({});
    const [isExporting, setIsExporting] = useState(false);
    const {
        applyFailure, applySuccess, beginQuery, commitQueryIdentity, forQuery,
        isLoading: collectionIsLoading, isQueryCurrent,
        setIsLoading,
    } = useCollectionDataState<ControlSummary, ControlListCapabilities>();
    const { beginRequest, isCurrentRequest } = useLatestRequestGuard();
    const runRowRestore = useRestoreWithFeedback();
    const requestParams = useMemo(() => ({
        ...buildControlRegisterListParams({
            currentPage, filters, groupValue: selectedGroupValue, limit: DEFAULT_LIST_PAGE_SIZE,
            search: debouncedSearch, sort, view: viewMode,
        }),
        department_id: departmentScope?.departmentId,
    }), [currentPage, debouncedSearch, departmentScope?.departmentId, filters, selectedGroupValue, sort, viewMode]);
    const listParams = useStableRegisterRequestParams(requestParams);
    const { queryIdentity, getExportParams } = useCommittedRegisterQuery(listParams, commitQueryIdentity);
    const queryState = forQuery(queryIdentity);
    const { capabilities, errorKey, groups, hasLoadedOnce, isAccessDenied, items, totalCount } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const visibleFacets = queryState.isCurrentQuery ? facets : {};

    const fetchControls = useCallback(async () => {
        const request = beginRequest();
        if (!beginQuery(queryIdentity)) setFacets({});
        setIsLoading(true);
        try {
            const response = await controlApi.getControls(listParams);
            if (!isCurrentRequest(request)) return;
            applySuccess(queryIdentity, { items: response.items, groups: response.groups ?? [], capabilities: response.capabilities ?? null, total: response.total });
            setFacets(response.facets ?? {});
        } catch (error) {
            if (!isCurrentRequest(request)) return;
            const patch = applyFailure(error, { toErrorKey: apiClient.toUiMessageKey.bind(apiClient) });
            if (patch.isAccessDenied) setFacets({});
        } finally { if (isCurrentRequest(request)) setIsLoading(false); }
    }, [applyFailure, applySuccess, beginQuery, beginRequest, isCurrentRequest, listParams, queryIdentity, setIsLoading]);

    useEffect(() => { void fetchControls(); }, [fetchControls]);

    const updateFilter = useCallback(<K extends keyof ControlRegisterFilters>(key: K, value: ControlRegisterFilters[K]) => {
        writeUrl({ filters: { ...filters, [key]: value }, group: null });
    }, [filters, writeUrl]);
    const clearFilters = useCallback(() => writeUrl({ filters: {
        lifecycle: 'active', monitoring_status: '', status: '', process: '', category: '',
    }, group: null }), [writeUrl]);
    // D9 / FB-01: a row restore reports through a toast and never flips the
    // register into its error state.
    const restoreControl = useCallback(async (controlId: number) => {
        const restoreQueryIdentity = queryIdentity;
        await runRowRestore({
            restore: () => controlApi.restoreControl(controlId),
            name: items.find((item) => item.id === controlId)?.name,
            refresh: async () => {
                if (isQueryCurrent(restoreQueryIdentity)) await fetchControls();
            },
        });
    }, [fetchControls, isQueryCurrent, items, queryIdentity, runRowRestore]);
    const exportCurrentControls = useCallback(async () => {
        setIsExporting(true);
        try {
            await controlApi.downloadExport(getExportParams(), language);
        }
        finally { setIsExporting(false); }
    }, [getExportParams, language]);
    const unsupportedForm = controlSnapshotUnsupportedForm(filters);
    const snapshotUnavailableReason = unsupportedForm
        ? t('register.snapshot_unavailable', { form: t(`control_forms.${unsupportedForm}`) })
        : undefined;
    const exportControlSnapshot = useCallback(async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        if (snapshotUnavailableReason) throw new Error(snapshotUnavailableReason);
        setIsExporting(true);
        try {
            await reportApi.exportControls({
                format,
                asOfDate,
                filters: {
                    departmentId: departmentScope?.departmentId,
                    status: filters.lifecycle === 'archived'
                        ? 'archived'
                        : filters.lifecycle === 'all'
                            ? null
                            : filters.status || null,
                    monitoringStatus: filters.monitoring_status || null,
                    search: debouncedSearch.trim() || null,
                },
            });
        }
        finally { setIsExporting(false); }
    }, [debouncedSearch, departmentScope?.departmentId, filters, snapshotUnavailableReason]);

    return {
        ...workingSet,
        capabilities, errorKey, facets: visibleFacets, filters, groups, hasLoadedOnce, isAccessDenied,
        isExporting, isLoading, items, limit: DEFAULT_LIST_PAGE_SIZE,
        totalCount, totalPages: getTotalPages(totalCount, DEFAULT_LIST_PAGE_SIZE), updateFilter,
        selectedGroupLabel: groupLabel(groups, selectedGroupValue),
        clearFilters, exportControlSnapshot, exportCurrentControls, fetchControls, restoreControl, snapshotUnavailableReason,
    };
}
