import { useState, useEffect } from 'react';
import { departmentApi, type DepartmentDetail } from '@/services/departmentApi';
import { userApi } from '@/services/userApi';
import type { RiskSummary } from '@/types/risk';
import type { ControlSummary } from '@/types/control';
import type { KeyRiskIndicator, KRIMonitoringStatus } from '@/types/kri';
import { logError } from '@/services/logger';
import { isForbiddenApiError } from '@/services/apiClient';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';

// Pagination constants - must match backend MAX_PAGE_SIZE
export const DEPARTMENT_PAGE_SIZE = 100;

// Simplified user type for scoped lookup
export interface DeptUser {
    id: number;
    name: string;
    email: string;
    role_name?: string | null;
    department_id?: number | null;
}

export type TabView = 'risks' | 'controls' | 'kris' | 'activity' | 'users';

/**
 * Per-tab async fetch state. `errorKey` is a localized-message key (resolved by the
 * consumer) so a failed tab fetch is distinguishable from an empty result (C4).
 */
export interface TabFetchState {
    isLoading: boolean;
    errorKey: string | null;
}

const INITIAL_TAB_STATE: TabFetchState = { isLoading: false, errorKey: null };

// Shared table-error message key (N17 contract). Reused for every tab fetch so a
// failed load surfaces the same localized "couldn't load, retry" affordance.
const TAB_ERROR_KEY = 'tables.error.message';

interface UseDepartmentDetailParams {
    departmentId: number | undefined;
    activeTab: TabView;
    riskFilter: 'all' | 'high';
    kriFilter: 'all' | KRIMonitoringStatus;
    riskPage: number;
    controlPage: number;
    kriPage: number;
    userPage: number;
}

interface UseDepartmentDetailResult {
    // Department metadata
    department: DepartmentDetail | null;
    isLoading: boolean;
    isAccessDenied: boolean;
    error: string | null;

    // Tab data
    risks: RiskSummary[];
    controls: ControlSummary[];
    kris: KeyRiskIndicator[];
    users: DeptUser[];

    // Pagination totals
    riskTotalPages: number;
    controlTotalPages: number;
    kriTotalPages: number;
    userTotalPages: number;

    // Per-tab async fetch state (loading + localized errorKey) so a failed tab
    // fetch renders an error + retry surface instead of a false empty state (C4).
    risksState: TabFetchState;
    controlsState: TabFetchState;
    krisState: TabFetchState;
    usersState: TabFetchState;

    // Risk count helper
    getRiskCount: () => number;

    // Refresh handler
    refresh: () => void;
}

/**
 * Custom hook to manage department detail data fetching.
 * Fetches department metadata once on id change, then fetches
 * tab-specific data only when that tab is active and page changes.
 */
export function useDepartmentDetail({
    departmentId,
    activeTab,
    riskFilter,
    kriFilter,
    riskPage,
    controlPage,
    kriPage,
    userPage,
}: UseDepartmentDetailParams): UseDepartmentDetailResult {
    const { thresholds } = useRiskThresholds();
    const [refreshNonce, setRefreshNonce] = useState(0);
    // Department metadata
    const [department, setDepartment] = useState<DepartmentDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Tab data
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [controls, setControls] = useState<ControlSummary[]>([]);
    const [kris, setKris] = useState<KeyRiskIndicator[]>([]);
    const [users, setUsers] = useState<DeptUser[]>([]);
    const [kriTotalCount, setKriTotalCount] = useState(0);

    // R3a: the departmentId each tab array currently belongs to. The hook does NOT
    // remount on a departmentId change (the route element `departments-detail` is
    // stable), so the raw arrays above are retained across an A->B navigation. Each
    // array is exposed to the consumer only while its owning id matches the current
    // `departmentId` (see the scoped* values below) — so a B tab fetch that is still
    // pending or has failed can never render department A's rows under department B.
    const [risksDeptId, setRisksDeptId] = useState<number | null>(null);
    const [controlsDeptId, setControlsDeptId] = useState<number | null>(null);
    const [krisDeptId, setKrisDeptId] = useState<number | null>(null);
    const [usersDeptId, setUsersDeptId] = useState<number | null>(null);

    // Per-tab async fetch state. Loading is set before each fetch; errorKey is
    // recorded on failure (last-good rows preserved) and cleared on retry.
    const [risksState, setRisksState] = useState<TabFetchState>(INITIAL_TAB_STATE);
    const [controlsState, setControlsState] = useState<TabFetchState>(INITIAL_TAB_STATE);
    const [krisState, setKrisState] = useState<TabFetchState>(INITIAL_TAB_STATE);
    const [usersState, setUsersState] = useState<TabFetchState>(INITIAL_TAB_STATE);

    // Fetch department metadata once on id change
    useEffect(() => {
        if (!departmentId) return;
        setIsLoading(true);
        setError(null);
        let cancelled = false;
        departmentApi.getDepartment(departmentId)
            .then((data) => {
                if (!cancelled) {
                    setDepartment(data);
                    setIsAccessDenied(false);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    const accessDenied = isForbiddenApiError(error);
                    setIsAccessDenied(accessDenied);
                    setDepartment(null);
                    setError(accessDenied ? null : 'errors.load_department_detail_failed');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, refreshNonce]);

    // Fetch risks when risks tab is active or page/filter changes
    useEffect(() => {
        if (!departmentId || activeTab !== 'risks') return;
        let cancelled = false;
        const skip = (riskPage - 1) * DEPARTMENT_PAGE_SIZE;
        const params: { skip: number; limit: number; min_net_score?: number } = {
            skip,
            limit: DEPARTMENT_PAGE_SIZE,
        };
        if (riskFilter === 'high') {
            params.min_net_score = thresholds.high;
        }
        setRisksState({ isLoading: true, errorKey: null });
        departmentApi.getDepartmentRisks(departmentId, params)
            .then((data) => {
                if (!cancelled) {
                    setRisks(data);
                    setRisksDeptId(departmentId);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    logError('Failed to load department risks.', error);
                    setRisksState((state) => ({ ...state, errorKey: TAB_ERROR_KEY }));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setRisksState((state) => ({ ...state, isLoading: false }));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, riskPage, riskFilter, refreshNonce, thresholds.high]);

    // Fetch controls when controls tab is active or page changes
    useEffect(() => {
        if (!departmentId || activeTab !== 'controls') return;
        let cancelled = false;
        const skip = (controlPage - 1) * DEPARTMENT_PAGE_SIZE;
        setControlsState({ isLoading: true, errorKey: null });
        departmentApi.getDepartmentControls(departmentId, { skip, limit: DEPARTMENT_PAGE_SIZE })
            .then((data) => {
                if (!cancelled) {
                    setControls(data);
                    setControlsDeptId(departmentId);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    logError('Failed to load department controls.', error);
                    setControlsState((state) => ({ ...state, errorKey: TAB_ERROR_KEY }));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setControlsState((state) => ({ ...state, isLoading: false }));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, controlPage, refreshNonce]);

    // Fetch KRIs when kris tab is active or page changes
    useEffect(() => {
        if (!departmentId || activeTab !== 'kris') return;
        let cancelled = false;
        const skip = (kriPage - 1) * DEPARTMENT_PAGE_SIZE;
        setKrisState({ isLoading: true, errorKey: null });
        departmentApi.getDepartmentKRIs(departmentId, {
            skip,
            limit: DEPARTMENT_PAGE_SIZE,
            monitoring_status: kriFilter === 'all' ? undefined : kriFilter,
        })
            .then((response) => {
                if (!cancelled) {
                    setKris(response.items);
                    setKriTotalCount(response.total);
                    setKrisDeptId(departmentId);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    logError('Failed to load department KRIs.', error);
                    setKrisState((state) => ({ ...state, errorKey: TAB_ERROR_KEY }));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setKrisState((state) => ({ ...state, isLoading: false }));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, kriFilter, kriPage, refreshNonce]);

    // Fetch users when users tab is active or page changes
    useEffect(() => {
        if (!departmentId || activeTab !== 'users') return;
        let cancelled = false;
        const skip = (userPage - 1) * DEPARTMENT_PAGE_SIZE;
        setUsersState({ isLoading: true, errorKey: null });
        userApi.listVisibleUsers({ department_id: departmentId, skip, limit: DEPARTMENT_PAGE_SIZE })
            .then((data) => {
                if (!cancelled) {
                    setUsers(data);
                    setUsersDeptId(departmentId);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    logError('Failed to load department users.', error);
                    setUsersState((state) => ({ ...state, errorKey: TAB_ERROR_KEY }));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setUsersState((state) => ({ ...state, isLoading: false }));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, userPage, refreshNonce]);

    // Compute risk count based on filter
    const getRiskCount = () => {
        if (!department) return 0;
        if (riskFilter === 'high') {
            return department.high_risk_count;
        }
        return department.risk_count;
    };

    // R3a scoping: only surface tab rows (and the KRI total) that belong to the
    // department currently in the route. Until B's own fetch resolves, each scoped
    // value falls back to empty/zero, so the consumer renders loading/empty/error
    // instead of department A's retained rows.
    const scopedRisks = risksDeptId === departmentId ? risks : [];
    const scopedControls = controlsDeptId === departmentId ? controls : [];
    const scopedKris = krisDeptId === departmentId ? kris : [];
    const scopedUsers = usersDeptId === departmentId ? users : [];
    const scopedKriTotalCount = krisDeptId === departmentId ? kriTotalCount : 0;

    // Compute pagination totals from department metadata
    const riskTotalPages = Math.ceil(getRiskCount() / DEPARTMENT_PAGE_SIZE) || 1;
    const controlTotalPages = Math.ceil((department?.control_count || 0) / DEPARTMENT_PAGE_SIZE) || 1;
    const kriTotalPages = Math.ceil(scopedKriTotalCount / DEPARTMENT_PAGE_SIZE) || 1;
    const userTotalPages = Math.ceil((department?.user_count || 0) / DEPARTMENT_PAGE_SIZE) || 1;

    // Refresh handler - re-fetches department metadata
    const refresh = () => {
        if (!departmentId) return;
        setRefreshNonce((current) => current + 1);
    };

    return {
        department,
        isLoading,
        isAccessDenied,
        error,
        risks: scopedRisks,
        controls: scopedControls,
        kris: scopedKris,
        users: scopedUsers,
        riskTotalPages,
        controlTotalPages,
        kriTotalPages,
        userTotalPages,
        risksState,
        controlsState,
        krisState,
        usersState,
        getRiskCount,
        refresh,
    };
}
