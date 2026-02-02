import { useState, useEffect, useCallback } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import { activityLogApi, type ActivityLogFilters } from '@/services/activityLogApi';
import type { ActivityLogEntry } from '@/types/activityLog';
import { lookupApi, type UserLookupItem } from '@/services/lookupApi';
import { riskApi } from '@/services/riskApi';

/** View modes for the activity log */
export type ViewMode = 'chronological' | 'by_person' | 'by_department' | 'by_risk';

/** Error types for display-specific handling */
export type ErrorType = 'access_denied' | 'network_error' | null;

/** Tab types for entity type filtering */
export type ActiveTab = 'kri' | 'risk' | 'control' | 'user';

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
    users: UserLookupItem[];
    departments: { id: number; name: string }[];
    risks: { id: number; name: string }[];

    // Entries
    entries: ActivityLogEntry[];
    total: number;
    isLoading: boolean;
    errorType: ErrorType;

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

    // View mode selectors
    const [selectedActorId, setSelectedActorId] = useState<number | null>(null);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
    const [selectedRiskId, setSelectedRiskId] = useState<number | null>(null);

    // Lookup data
    const [users, setUsers] = useState<UserLookupItem[]>([]);
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

    // If the hook is disabled, ensure we don't show stale loading/error state.
    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            setErrorType(null);
            setEntries([]);
            setTotal(0);
        }
    }, [enabled]);

    // setViewMode wrapper: reset selectors when changing mode
    const setViewMode = useCallback((mode: ViewMode) => {
        setViewModeInternal(mode);
        setPage(0);
        // Reset selectors when changing mode
        if (mode !== 'by_person') setSelectedActorId(null);
        if (mode !== 'by_department') setSelectedDepartmentId(null);
        if (mode !== 'by_risk') setSelectedRiskId(null);
    }, []);

    // setActiveTab wrapper: reset page on tab change
    const setActiveTab = useCallback((tab: ActiveTab) => {
        setActiveTabInternal(tab);
        setPage(0);
    }, []);

    // Load filter options and lookup data for view modes
    useEffect(() => {
        if (!enabled) return;
        const loadOptions = async () => {
            try {
                const [acts, usersData, deptsData, risksData] = await Promise.all([
                    activityLogApi.getActions(),
                    lookupApi.getUsers(),
                    lookupApi.getDepartments(),
                    riskApi.getRisks({ limit: 100 }) // Get first 100 risks for picker (matches backend cap)
                ]);
                setActions(acts);
                setUsers(usersData);
                setDepartments(deptsData.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name })));
                setRisks(risksData.items.map((r: { id: number; name: string }) => ({ id: r.id, name: r.name })));
            } catch (err) {
                console.error('Failed to load filter options:', err);
            }
        };
        loadOptions();
    }, [enabled]);

    // Build entity types based on tab and view mode
    const getEntityTypes = useCallback((): string[] | undefined => {
        // View mode by_risk overrides tab filtering
        if (viewMode === 'by_risk' && selectedRiskId) {
            return ['risk'];
        }
        // Map tabs to entity types (chronological and other modes use tab filtering)
        switch (activeTab) {
            case 'kri':
                return ['kri', 'kri_value'];
            case 'risk':
                return ['risk'];
            case 'control':
                return ['control', 'control_execution', 'control_risk_link'];
            case 'user':
                return ['user', 'role', 'department', 'approval', 'config'];
            default:
                return undefined;
        }
    }, [viewMode, selectedRiskId, activeTab]);

    // Fetch entries 
    const fetchEntries = useCallback(async () => {
        if (!enabled) return;
        setIsLoading(true);
        setErrorType(null);
        try {
            const entityTypes = getEntityTypes();
            const entityId = (viewMode === 'by_risk' && selectedRiskId) ? selectedRiskId : undefined;

            const filters: ActivityLogFilters = {
                skip: page * limit,
                limit,
                search: debouncedSearch || undefined,
                entity_type: entityTypes,
                entity_id: entityId,
                actor_id: viewMode === 'by_person' && selectedActorId ? selectedActorId : undefined,
                department_id: viewMode === 'by_department' && selectedDepartmentId ? selectedDepartmentId : undefined,
                action: action || undefined,
                date_from: dateFrom || undefined,
                // Convert date_to to inclusive end-of-day timestamp
                // This ensures entries from the selected end date are included
                date_to: dateTo ? `${dateTo}T23:59:59.999` : undefined,
            };
            const response = await activityLogApi.list(filters);
            setEntries(response.items);
            setTotal(response.total);
        } catch (error) {
            console.error('Failed to fetch activity logs:', error);
            // Distinguish 403 from other errors
            if (error instanceof Error && 'response' in error) {
                const resp = (error as { response?: { status?: number } }).response;
                if (resp?.status === 403) {
                    setErrorType('access_denied');
                } else {
                    setErrorType('network_error');
                }
            } else {
                setErrorType('network_error');
            }
            setEntries([]);
            setTotal(0);
        } finally {
            setIsLoading(false);
        }
    }, [
        enabled,
        page,
        limit,
        debouncedSearch,
        activeTab,
        action,
        dateFrom,
        dateTo,
        viewMode,
        selectedActorId,
        selectedDepartmentId,
        selectedRiskId,
        getEntityTypes,
    ]);

    // Auto-fetch on dependency changes
    useEffect(() => {
        if (!enabled) return;
        fetchEntries();
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
        selectedDepartmentId,
        setSelectedDepartmentId,
        selectedRiskId,
        setSelectedRiskId,

        // Lookup data
        users,
        departments,
        risks,

        // Entries
        entries,
        total,
        isLoading,
        errorType,

        // Pagination
        page,
        setPage,
        limit,

        // Actions
        refresh: fetchEntries,
    };
}
