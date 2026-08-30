import { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from './useDebouncedValue';
import {
    activityLogEntityTypes,
    buildActivityLogFilters,
    transitionActivityLogViewMode,
    type ActiveTab,
    type ViewMode,
} from './activityLogPageWorkflow';
import {
    buildActivityLogUrlParams,
    parseActivityLogUrlState,
    type ActivityLogUrlState,
} from './activityLogUrlState';
import { activityLogApi } from '@/services/activityLogApi';
import type { ActivityLogActorLookup, ActivityLogCapabilities, ActivityLogEntry } from '@/types/activityLog';
import { lookupApi } from '@/services/lookupApi';
import { riskApi } from '@/services/riskApi';
import { logError } from '@/services/logger';
import { useDepartmentRegisterScope } from '@/pages/departments/useDepartmentRegisterScope';
import {
    resolveCollectionOutcome,
    useCollectionDataState,
    type CollectionOutcome,
} from '@/pages/shared/collectionPageState';

export type { ActiveTab, ViewMode } from './activityLogPageWorkflow';

interface UseActivityLogPageStateReturn {
    // View mode
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;

    // Active tab
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;

    // Search filter
    search: string;
    setSearch: (search: string) => void;
    debouncedSearch: string;
    isSearchSettling: boolean;

    // Action filter
    action: string;
    setAction: (action: string) => void;
    actions: string[];

    // Date filters
    dateFrom: string;
    setDateFrom: (date: string) => void;
    dateTo: string;
    setDateTo: (date: string) => void;

    // View mode selectors
    selectedActorId: number | null;
    setSelectedActorId: (id: number | null) => void;
    selectedDepartmentId: number | null;
    setSelectedDepartmentId: (id: number | null) => void;
    selectedRiskId: number | null;
    setSelectedRiskId: (id: number | null) => void;

    // Lookup data
    actors: ActivityLogActorLookup[];
    departments: { id: number; name: string }[];
    risks: { id: number; name: string }[];

    // Entries
    entries: ActivityLogEntry[];
    total: number;
    isLoading: boolean;
    outcome: CollectionOutcome;
    needsRiskSelection: boolean;
    capabilities: ActivityLogCapabilities | null;

    // Pagination
    page: number;
    setPage: Dispatch<SetStateAction<number>>;
    limit: number;

    // Actions
    refresh: () => void;
}

interface UseActivityLogPageStateOptions {
    /**
     * When false, the hook becomes inert and does not make any API calls.
     * This enables permission-gated pages to still satisfy rules-of-hooks.
     */
    enabled?: boolean;
}

/**
 * Consolidated state management hook for ActivityLogPage.
 * 
 * Owns:
 * - View mode state + selectors
 * - Search debounce using useDebouncedValue
 * - Building ActivityLogFilters payloads
 * - Fetching entries + total with correct pagination
 * - Loading lookup data (users/departments/risks) for selectors
 */
export function useActivityLogPageState(
    options: UseActivityLogPageStateOptions = {},
): UseActivityLogPageStateReturn {
    const enabled = options.enabled ?? true;
    const departmentScope = useDepartmentRegisterScope();
    const [searchParams, setSearchParams] = useSearchParams();

    // Pagination remains zero-based at the page component boundary. The URL is
    // one-based and omits the first page, matching the register codecs.
    const [limit] = useState(50);

    // Entries
    const entryCollection = useCollectionDataState<ActivityLogEntry, ActivityLogCapabilities>();
    const {
        applyFailure,
        applyPatch,
        applySuccess,
        beginQuery,
        commitQueryIdentity,
        forQuery,
        isLoading: collectionIsLoading,
        isQueryCurrent,
        setIsLoading,
    } = entryCollection;

    // Lookup data
    const [actors, setActors] = useState<ActivityLogActorLookup[]>([]);
    const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
    const [risks, setRisks] = useState<{ id: number; name: string }[]>([]);

    // Filter options
    const [actions, setActions] = useState<string[]>([]);
    const [actionsLoaded, setActionsLoaded] = useState(false);
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => {
        const parsed = parseActivityLogUrlState(searchParams, {
            allowedActions: actionsLoaded ? actions : undefined,
            departmentScopeId: departmentScope?.departmentId,
        });
        const requestedAction = searchParams.get('action') ?? '';
        if (actionsLoaded && requestedAction !== '' && !actions.includes(requestedAction)) {
            return { ...parsed, page: 1 };
        }
        return parsed;
    }, [actions, actionsLoaded, departmentScope?.departmentId, searchParams]);
    const {
        action,
        actorId: selectedActorId,
        dateFrom,
        dateTo,
        departmentId: selectedDepartmentId,
        page: urlPage,
        riskId: selectedRiskId,
        search,
        tab: activeTab,
        view: viewMode,
    } = urlState;
    const page = urlPage - 1;
    const debouncedSearch = useDebouncedValue(search, 300);
    const isSearchSettling = search !== debouncedSearch;
    const needsRiskSelection = viewMode === 'by_risk' && selectedRiskId === null;
    const latestEntriesRequestIdRef = useRef(0);
    const activeEntriesQueryKeyRef = useRef<string | null>(null);
    const activeEntriesQueryGenerationRef = useRef(0);
    const pendingRetryRef = useRef<{ generation: number; queryKey: string } | null>(null);
    const latestUrlParamsRef = useRef(new URLSearchParams(searchParams));

    useLayoutEffect(() => {
        latestUrlParamsRef.current = new URLSearchParams(searchParams);
    }, [searchParams, serializedParams]);

    const updateUrlState = useCallback((
        updater: (current: ActivityLogUrlState) => ActivityLogUrlState,
        replace = false,
    ) => {
        const currentParams = latestUrlParamsRef.current;
        const current = parseActivityLogUrlState(currentParams, {
            allowedActions: actionsLoaded ? actions : undefined,
            departmentScopeId: departmentScope?.departmentId,
        });
        const nextParams = buildActivityLogUrlParams(updater(current), currentParams);
        latestUrlParamsRef.current = nextParams;
        setSearchParams(nextParams, { replace });
    }, [actions, actionsLoaded, departmentScope?.departmentId, setSearchParams]);

    useEffect(() => {
        const canonical = buildActivityLogUrlParams(urlState, searchParams);
        if (canonical.toString() !== serializedParams) {
            latestUrlParamsRef.current = canonical;
            setSearchParams(canonical, { replace: true });
        }
    }, [searchParams, serializedParams, setSearchParams, urlState]);

    // If the hook is disabled, ensure we don't show stale loading/error state.
    useEffect(() => {
        if (!enabled) {
            latestEntriesRequestIdRef.current += 1;
            activeEntriesQueryKeyRef.current = null;
            activeEntriesQueryGenerationRef.current += 1;
            beginQuery('disabled');
            applyPatch({
                items: [],
                groups: [],
                capabilities: null,
                totalCount: 0,
                errorKey: null,
                isAccessDenied: false,
                hasLoadedOnce: true,
            });
            setIsLoading(false);
        }
    }, [applyPatch, beginQuery, enabled, setIsLoading]);

    const setViewMode = useCallback((mode: ViewMode) => {
        updateUrlState((current) => {
            const nextSelectors = transitionActivityLogViewMode({
                nextMode: mode,
                selectedActorId: current.actorId,
                selectedDepartmentId: current.departmentId,
                selectedRiskId: current.riskId,
            });
            return {
                ...current,
                view: mode,
                page: 1,
                actorId: nextSelectors.selectedActorId,
                departmentId: mode === 'by_department'
                    ? departmentScope?.departmentId ?? nextSelectors.selectedDepartmentId
                    : null,
                riskId: nextSelectors.selectedRiskId,
            };
        });
    }, [departmentScope?.departmentId, updateUrlState]);

    const setActiveTab = useCallback((tab: ActiveTab) => {
        updateUrlState((current) => ({ ...current, tab, page: 1 }));
    }, [updateUrlState]);

    const setSearch = useCallback((nextSearch: string) => {
        updateUrlState((current) => ({ ...current, search: nextSearch, page: 1 }), true);
    }, [updateUrlState]);

    const setAction = useCallback((nextAction: string) => {
        updateUrlState((current) => ({ ...current, action: nextAction, page: 1 }));
    }, [updateUrlState]);

    const setDateFrom = useCallback((nextDate: string) => {
        updateUrlState((current) => ({ ...current, dateFrom: nextDate, page: 1 }));
    }, [updateUrlState]);

    const setDateTo = useCallback((nextDate: string) => {
        updateUrlState((current) => ({ ...current, dateTo: nextDate, page: 1 }));
    }, [updateUrlState]);

    const setSelectedActorId = useCallback((id: number | null) => {
        updateUrlState((current) => ({ ...current, actorId: id, page: 1 }));
    }, [updateUrlState]);

    const setSelectedDepartmentId = useCallback((id: number | null) => {
        if (departmentScope) return;
        updateUrlState((current) => ({ ...current, departmentId: id, page: 1 }));
    }, [departmentScope, updateUrlState]);

    const setSelectedRiskId = useCallback((id: number | null) => {
        updateUrlState((current) => ({ ...current, riskId: id, page: 1 }));
    }, [updateUrlState]);

    const setPage = useCallback<Dispatch<SetStateAction<number>>>((nextPage) => {
        updateUrlState((current) => {
            const currentPage = current.page - 1;
            const zeroBasedPage = typeof nextPage === 'function' ? nextPage(currentPage) : nextPage;
            const safePage = Number.isSafeInteger(zeroBasedPage) && zeroBasedPage >= 0 ? zeroBasedPage : 0;
            return { ...current, page: safePage + 1 };
        });
    }, [updateUrlState]);

    // Load filter options and lookup data for view modes
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        const loadOptions = async () => {
            const results = await Promise.allSettled([
                activityLogApi.getActions(),
                departmentScope
                    ? activityLogApi.getActors(departmentScope.departmentId)
                    : activityLogApi.getActors(),
                departmentScope
                    ? Promise.resolve([{ id: departmentScope.departmentId, name: departmentScope.departmentName }])
                    : lookupApi.getDepartments(),
                riskApi.getRisks({
                    limit: 100,
                    department_id: departmentScope?.departmentId,
                }), // Get first 100 risks for picker (matches backend cap)
            ]);
            if (cancelled) return;

            const [actionsResult, actorsResult, departmentsResult, risksResult] = results;
            if (actionsResult.status === 'fulfilled') {
                setActions(actionsResult.value);
                setActionsLoaded(true);
            } else {
                logError('Failed to load activity actions:', actionsResult.reason);
            }
            if (actorsResult.status === 'fulfilled') {
                setActors(actorsResult.value);
            } else {
                logError('Failed to load activity actors:', actorsResult.reason);
            }
            if (departmentsResult.status === 'fulfilled') {
                setDepartments(departmentsResult.value.map((d) => ({ id: d.id, name: d.name })));
            } else {
                logError('Failed to load activity departments:', departmentsResult.reason);
            }
            if (risksResult.status === 'fulfilled') {
                setRisks(risksResult.value.items.map((r) => ({ id: r.id, name: r.name })));
            } else {
                logError('Failed to load activity risks:', risksResult.reason);
            }
        };
        void loadOptions();
        return () => {
            cancelled = true;
        };
    }, [departmentScope, enabled]);

    // Build entity types based on tab and view mode
    const getEntityTypes = useCallback((): string[] | undefined => {
        return activityLogEntityTypes({ viewMode, selectedRiskId, activeTab });
    }, [viewMode, selectedRiskId, activeTab]);

    const entryFilters = useMemo(() => {
        if (!enabled || needsRiskSelection) return null;
        const filters = buildActivityLogFilters({
            page,
            limit,
            search: debouncedSearch,
            entityTypes: getEntityTypes(),
            entityId: (viewMode === 'by_risk' && selectedRiskId) ? selectedRiskId : undefined,
            viewMode,
            selectedActorId,
            selectedDepartmentId: departmentScope?.departmentId ?? selectedDepartmentId,
            action,
            dateFrom,
            dateTo,
        });
        if (departmentScope) filters.department_id = departmentScope.departmentId;
        return filters;
    }, [
        action,
        dateFrom,
        dateTo,
        debouncedSearch,
        departmentScope,
        enabled,
        getEntityTypes,
        limit,
        needsRiskSelection,
        page,
        selectedActorId,
        selectedDepartmentId,
        selectedRiskId,
        viewMode,
    ]);
    let renderedEntriesQueryKey = 'disabled';
    let requestedEntriesQueryKey = 'disabled';
    if (enabled && needsRiskSelection) {
        renderedEntriesQueryKey = 'risk-selection-required';
        requestedEntriesQueryKey = 'risk-selection-required';
    } else if (enabled) {
        const queryIdentity = {
            action,
            activeTab,
            dateFrom,
            dateTo,
            departmentId: departmentScope?.departmentId ?? selectedDepartmentId,
            limit,
            page,
            riskId: selectedRiskId,
            selectedActorId,
            viewMode,
        };
        renderedEntriesQueryKey = JSON.stringify({ ...queryIdentity, search });
        requestedEntriesQueryKey = JSON.stringify({ ...queryIdentity, search: debouncedSearch });
    }
    useLayoutEffect(
        () => commitQueryIdentity(renderedEntriesQueryKey),
        [commitQueryIdentity, renderedEntriesQueryKey],
    );
    const queryState = forQuery(renderedEntriesQueryKey);
    const {
        capabilities,
        items: entries,
        totalCount: total,
    } = queryState;
    const isLoading = collectionIsLoading || !queryState.isCurrentQuery;
    const outcome = resolveCollectionOutcome(queryState, isLoading);

    // Fetch entries 
    const fetchEntries = useCallback(async () => {
        if (!enabled) return;
        if (needsRiskSelection) {
            latestEntriesRequestIdRef.current += 1;
            if (activeEntriesQueryKeyRef.current !== 'risk-selection-required') {
                activeEntriesQueryKeyRef.current = 'risk-selection-required';
                activeEntriesQueryGenerationRef.current += 1;
            }
            beginQuery(requestedEntriesQueryKey);
            applyPatch({
                items: [],
                groups: [],
                capabilities: null,
                totalCount: 0,
                errorKey: null,
                isAccessDenied: false,
                hasLoadedOnce: true,
            });
            setIsLoading(false);
            return;
        }
        if (!entryFilters) return;
        const queryKey = requestedEntriesQueryKey;
        if (activeEntriesQueryKeyRef.current !== queryKey) {
            activeEntriesQueryKeyRef.current = queryKey;
            activeEntriesQueryGenerationRef.current += 1;
        }
        beginQuery(queryKey);
        const requestId = ++latestEntriesRequestIdRef.current;
        setIsLoading(true);
        try {
            const response = await activityLogApi.list(entryFilters);
            if (
                requestId === latestEntriesRequestIdRef.current
                && isQueryCurrent(queryKey)
            ) {
                applySuccess(queryKey, {
                    items: response.items,
                    groups: [],
                    capabilities: response.capabilities ?? null,
                    total: response.total,
                });
            }
        } catch (error) {
            if (
                requestId === latestEntriesRequestIdRef.current
                && isQueryCurrent(queryKey)
            ) {
                logError('Failed to fetch activity logs:', error);
                applyFailure(error, { fallbackErrorKey: 'activity_log.failed_to_load' });
            }
        } finally {
            if (
                requestId === latestEntriesRequestIdRef.current
                && isQueryCurrent(queryKey)
            ) {
                setIsLoading(false);
            }
        }
    }, [
        applyFailure,
        applyPatch,
        applySuccess,
        beginQuery,
        enabled,
        entryFilters,
        isQueryCurrent,
        needsRiskSelection,
        requestedEntriesQueryKey,
        setIsLoading,
    ]);

    const refresh = useCallback(() => {
        if (isSearchSettling) {
            return;
        }
        const queryKey = activeEntriesQueryKeyRef.current;
        if (queryKey === null) {
            return;
        }
        const retry = {
            generation: activeEntriesQueryGenerationRef.current,
            queryKey,
        };
        if (pendingRetryRef.current?.generation === retry.generation) {
            return;
        }
        pendingRetryRef.current = retry;
        void fetchEntries().finally(() => {
            if (pendingRetryRef.current === retry) {
                pendingRetryRef.current = null;
            }
        });
    }, [fetchEntries, isSearchSettling]);

    // Auto-fetch on dependency changes
    useEffect(() => {
        if (!enabled) return;
        void fetchEntries();
    }, [enabled, fetchEntries]);

    return {
        // View mode
        viewMode,
        setViewMode,

        // Active tab
        activeTab,
        setActiveTab,

        // Search filter
        search,
        setSearch,
        debouncedSearch,
        isSearchSettling,

        // Action filter
        action,
        setAction,
        actions,

        // Date filters
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,

        // View mode selectors
        selectedActorId,
        setSelectedActorId,
        selectedDepartmentId,
        setSelectedDepartmentId,
        selectedRiskId,
        setSelectedRiskId,

        // Lookup data
        actors,
        departments,
        risks,

        // Entries
        entries,
        total,
        isLoading,
        outcome,
        needsRiskSelection,
        capabilities,

        // Pagination
        page,
        setPage,
        limit,

        // Actions
        refresh,
    };
}
