import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import {
    activityLogEntityTypes,
    buildActivityLogFilters,
    transitionActivityLogViewMode,
    type ActiveTab,
    type ViewMode,
} from './activityLogPageWorkflow';
import { activityLogApi } from '@/services/activityLogApi';
import type { ActivityLogActorLookup, ActivityLogCapabilities, ActivityLogEntry } from '@/types/activityLog';
import { lookupApi } from '@/services/lookupApi';
import { riskApi } from '@/services/riskApi';
import { logError } from '@/services/logger';
import { isForbiddenApiError } from '@/services/apiClient';
import { useDepartmentRegisterScope } from '@/pages/departments/useDepartmentRegisterScope';

export type { ActiveTab, ViewMode } from './activityLogPageWorkflow';

/** Error types for display-specific handling */
export type ErrorType = 'access_denied' | 'network_error' | null;

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
    errorType: ErrorType;
    needsRiskSelection: boolean;
    capabilities: ActivityLogCapabilities | null;

    // Pagination
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
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

    // View mode state
    const [viewMode, setViewModeInternal] = useState<ViewMode>('chronological');

    // Tab state
    const [activeTab, setActiveTabInternal] = useState<ActiveTab>('kri');

    // Pagination
    const [page, setPage] = useState(0);
    const [limit] = useState(50);

    // Entries
    const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorType, setErrorType] = useState<ErrorType>(null);
    const [capabilities, setCapabilities] = useState<ActivityLogCapabilities | null>(null);

    // View mode selectors
    const [selectedActorId, setSelectedActorId] = useState<number | null>(null);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
    const [selectedRiskId, setSelectedRiskId] = useState<number | null>(null);

    // Lookup data
    const [actors, setActors] = useState<ActivityLogActorLookup[]>([]);
    const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
    const [risks, setRisks] = useState<{ id: number; name: string }[]>([]);

    // Filters
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 300);
    const [action, setAction] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Filter options
    const [actions, setActions] = useState<string[]>([]);
    const needsRiskSelection = viewMode === 'by_risk' && selectedRiskId === null;
    const latestEntriesRequestIdRef = useRef(0);

    // If the hook is disabled, ensure we don't show stale loading/error state.
    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            setErrorType(null);
            setEntries([]);
            setTotal(0);
            setCapabilities(null);
        }
    }, [enabled]);

    // setViewMode wrapper: reset selectors when changing mode
    const setViewMode = useCallback((mode: ViewMode) => {
        setViewModeInternal(mode);
        setPage(0);
        const nextSelectors = transitionActivityLogViewMode({
            nextMode: mode,
            selectedActorId,
            selectedDepartmentId,
            selectedRiskId,
        });
        setSelectedActorId(nextSelectors.selectedActorId);
        setSelectedDepartmentId(nextSelectors.selectedDepartmentId);
        setSelectedRiskId(nextSelectors.selectedRiskId);
    }, [selectedActorId, selectedDepartmentId, selectedRiskId]);

    // setActiveTab wrapper: reset page on tab change
    const setActiveTab = useCallback((tab: ActiveTab) => {
        setActiveTabInternal(tab);
        setPage(0);
    }, []);

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

    // Fetch entries 
    const fetchEntries = useCallback(async () => {
        if (!enabled) return;
        if (needsRiskSelection) {
            latestEntriesRequestIdRef.current += 1;
            setEntries([]);
            setTotal(0);
            setIsLoading(false);
            setErrorType(null);
            return;
        }
        const requestId = ++latestEntriesRequestIdRef.current;
        setIsLoading(true);
        setErrorType(null);
        try {
            const entityTypes = getEntityTypes();
            const entityId = (viewMode === 'by_risk' && selectedRiskId) ? selectedRiskId : undefined;

            const filters = buildActivityLogFilters({
                page,
                limit,
                search: debouncedSearch,
                entityTypes,
                entityId,
                viewMode,
                selectedActorId,
                selectedDepartmentId: departmentScope?.departmentId ?? selectedDepartmentId,
                action,
                dateFrom,
                dateTo,
            });
            if (departmentScope) filters.department_id = departmentScope.departmentId;
            const response = await activityLogApi.list(filters);
            if (requestId === latestEntriesRequestIdRef.current) {
                setEntries(response.items);
                setTotal(response.total);
                setCapabilities(response.capabilities ?? null);
            }
        } catch (error) {
            logError('Failed to fetch activity logs:', error);
            if (requestId === latestEntriesRequestIdRef.current) {
                const accessDenied = isForbiddenApiError(error);
                setErrorType(accessDenied ? 'access_denied' : 'network_error');
                setEntries([]);
                setTotal(0);
                setCapabilities(null);
            }
        } finally {
            if (requestId === latestEntriesRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [
        enabled,
        needsRiskSelection,
        page,
        limit,
        debouncedSearch,
        action,
        dateFrom,
        dateTo,
        viewMode,
        selectedActorId,
        selectedDepartmentId,
        selectedRiskId,
        departmentScope,
        getEntityTypes,
    ]);

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
        selectedDepartmentId: departmentScope?.departmentId ?? selectedDepartmentId,
        setSelectedDepartmentId: departmentScope ? () => undefined : setSelectedDepartmentId,
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
        errorType,
        needsRiskSelection,
        capabilities,

        // Pagination
        page,
        setPage,
        limit,

        // Actions
        refresh: () => {
            void fetchEntries();
        },
    };
}
