import { useState, useEffect } from 'react';
import { departmentApi, type DepartmentDetail } from '@/services/departmentApi';
import { userApi } from '@/services/userApi';
import type { RiskSummary } from '@/types/risk';
import type { ControlSummary } from '@/types/control';
import type { KeyRiskIndicator, KRIMonitoringStatus } from '@/types/kri';

// Pagination constants - must match backend MAX_PAGE_SIZE
export const DEPARTMENT_PAGE_SIZE = 100;
// High risk threshold (net_score >= 10 = High or Critical)
export const HIGH_RISK_MIN_NET_SCORE = 10;

// Simplified user type for scoped lookup
export interface DeptUser {
    id: number;
    name: string;
    email: string;
    role_name?: string | null;
    department_id?: number | null;
}

export type TabView = 'risks' | 'controls' | 'kris' | 'activity' | 'users';

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
    const [refreshNonce, setRefreshNonce] = useState(0);
    // Department metadata
    const [department, setDepartment] = useState<DepartmentDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Tab data
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [controls, setControls] = useState<ControlSummary[]>([]);
    const [kris, setKris] = useState<KeyRiskIndicator[]>([]);
    const [users, setUsers] = useState<DeptUser[]>([]);
    const [kriTotalCount, setKriTotalCount] = useState(0);

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
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setError('errors.load_department_detail_failed');
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
            params.min_net_score = HIGH_RISK_MIN_NET_SCORE;
        }
        departmentApi.getDepartmentRisks(departmentId, params)
            .then((data) => {
                if (!cancelled) {
                    setRisks(data);
                }
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, riskPage, riskFilter, refreshNonce]);

    // Fetch controls when controls tab is active or page changes
    useEffect(() => {
        if (!departmentId || activeTab !== 'controls') return;
        let cancelled = false;
        const skip = (controlPage - 1) * DEPARTMENT_PAGE_SIZE;
        departmentApi.getDepartmentControls(departmentId, { skip, limit: DEPARTMENT_PAGE_SIZE })
            .then((data) => {
                if (!cancelled) {
                    setControls(data);
                }
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, controlPage, refreshNonce]);

    // Fetch KRIs when kris tab is active or page changes
    useEffect(() => {
        if (!departmentId || activeTab !== 'kris') return;
        let cancelled = false;
        const skip = (kriPage - 1) * DEPARTMENT_PAGE_SIZE;
        departmentApi.getDepartmentKRIs(departmentId, {
            skip,
            limit: DEPARTMENT_PAGE_SIZE,
            monitoring_status: kriFilter === 'all' ? undefined : kriFilter,
        })
            .then((response) => {
                if (!cancelled) {
                    setKris(response.items);
                    setKriTotalCount(response.total);
                }
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, kriFilter, kriPage, refreshNonce]);

    // Fetch users when users tab is active or page changes
    useEffect(() => {
        if (!departmentId || activeTab !== 'users') return;
        let cancelled = false;
        const skip = (userPage - 1) * DEPARTMENT_PAGE_SIZE;
        userApi.listVisibleUsers({ department_id: departmentId, skip, limit: DEPARTMENT_PAGE_SIZE })
            .then((data) => {
                if (!cancelled) {
                    setUsers(data);
                }
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, userPage, refreshNonce]);

    // Compute risk count based on filter
    const getRiskCount = () => {
        if (!department) return 0;
        if (riskFilter === 'high') {
            return department.risk_distribution.critical + department.risk_distribution.high;
        }
        return department.risk_count;
    };

    // Compute pagination totals from department metadata
    const riskTotalPages = Math.ceil(getRiskCount() / DEPARTMENT_PAGE_SIZE) || 1;
    const controlTotalPages = Math.ceil((department?.control_count || 0) / DEPARTMENT_PAGE_SIZE) || 1;
    const kriTotalPages = Math.ceil(kriTotalCount / DEPARTMENT_PAGE_SIZE) || 1;
    const userTotalPages = Math.ceil((department?.user_count || 0) / DEPARTMENT_PAGE_SIZE) || 1;

    // Refresh handler - re-fetches department metadata
    const refresh = () => {
        if (!departmentId) return;
        setRefreshNonce((current) => current + 1);
    };

    return {
        department,
        isLoading,
        error,
        risks,
        controls,
        kris,
        users,
        riskTotalPages,
        controlTotalPages,
        kriTotalPages,
        userTotalPages,
        getRiskCount,
        refresh,
    };
}
