import { useEffect, useReducer, useRef, useState } from 'react';

import { isForbiddenApiError } from '@/services/apiClient';
import { departmentApi, type DepartmentDetail } from '@/services/departmentApi';
import { logError } from '@/services/logger';
import { userApi } from '@/services/userApi';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import type { ControlSummary } from '@/types/control';
import type { KeyRiskIndicator, KRIMonitoringStatus } from '@/types/kri';
import type { RiskSummary } from '@/types/risk';

// Pagination constants - must match backend MAX_PAGE_SIZE
export const DEPARTMENT_PAGE_SIZE = 100;

export interface DeptUser {
    id: number;
    name: string;
    email: string;
    role_name?: string | null;
    department_id?: number | null;
}

export type TabView = 'risks' | 'controls' | 'kris' | 'activity' | 'users';

export interface TabFetchState {
    isLoading: boolean;
    errorKey: string | null;
}

const TAB_ERROR_KEY = 'tables.error.message';

/**
 * Internal owner-keyed async state. `ownerId` belongs to the settled data;
 * `requestedOwnerId` belongs to the in-flight/latest request. Keeping both is
 * what permits same-department stale-data preservation without ever exposing
 * department A data while the current route belongs to B.
 */
interface ScopedTabState<T> {
    data: T;
    ownerId: number | null;
    requestedOwnerId: number | null;
    requestId: number;
    isLoading: boolean;
    errorKey: string | null;
}

type ScopedTabAction<T> =
    | { type: 'start'; ownerId: number; requestId: number }
    | { type: 'success'; ownerId: number; requestId: number; data: T }
    | { type: 'failure'; ownerId: number; requestId: number; errorKey: string };

function createScopedState<T>(data: T): ScopedTabState<T> {
    return {
        data,
        ownerId: null,
        requestedOwnerId: null,
        requestId: 0,
        isLoading: false,
        errorKey: null,
    };
}

function scopedTabReducer<T>(state: ScopedTabState<T>, action: ScopedTabAction<T>): ScopedTabState<T> {
    if (action.type === 'start') {
        return {
            ...state,
            requestedOwnerId: action.ownerId,
            requestId: action.requestId,
            isLoading: true,
            errorKey: null,
        };
    }
    if (action.requestId !== state.requestId || action.ownerId !== state.requestedOwnerId) {
        return state;
    }
    if (action.type === 'failure') {
        return { ...state, isLoading: false, errorKey: action.errorKey };
    }
    return {
        data: action.data,
        ownerId: action.ownerId,
        requestedOwnerId: action.ownerId,
        requestId: action.requestId,
        isLoading: false,
        errorKey: null,
    };
}

interface DepartmentOutcome {
    department: DepartmentDetail | null;
    isAccessDenied: boolean;
    error: string | null;
}

interface KriOutcome {
    items: KeyRiskIndicator[];
    total: number;
}

const EMPTY_DEPARTMENT: DepartmentOutcome = {
    department: null,
    isAccessDenied: false,
    error: null,
};
const EMPTY_KRIS: KriOutcome = { items: [], total: 0 };

function dataForOwner<T>(state: ScopedTabState<T>, departmentId: number | undefined, empty: T): T {
    return departmentId !== undefined && state.ownerId === departmentId ? state.data : empty;
}

function statusForOwner<T>(state: ScopedTabState<T>, departmentId: number | undefined): TabFetchState {
    if (departmentId === undefined) return { isLoading: false, errorKey: null };
    return {
        isLoading: state.requestedOwnerId !== departmentId || state.isLoading,
        errorKey: state.requestedOwnerId === departmentId ? state.errorKey : null,
    };
}

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
    department: DepartmentDetail | null;
    isLoading: boolean;
    isAccessDenied: boolean;
    error: string | null;
    risks: RiskSummary[];
    controls: ControlSummary[];
    kris: KeyRiskIndicator[];
    users: DeptUser[];
    riskTotalPages: number;
    controlTotalPages: number;
    kriTotalPages: number;
    userTotalPages: number;
    risksState: TabFetchState;
    controlsState: TabFetchState;
    krisState: TabFetchState;
    usersState: TabFetchState;
    getRiskCount: () => number;
    refresh: () => void;
}

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
    const requestSequence = useRef(0);
    const nextRequestId = () => {
        requestSequence.current += 1;
        return requestSequence.current;
    };

    const [departmentResource, dispatchDepartment] = useReducer(
        scopedTabReducer<DepartmentOutcome>,
        createScopedState(EMPTY_DEPARTMENT),
    );
    const [risksResource, dispatchRisks] = useReducer(
        scopedTabReducer<RiskSummary[]>,
        createScopedState<RiskSummary[]>([]),
    );
    const [controlsResource, dispatchControls] = useReducer(
        scopedTabReducer<ControlSummary[]>,
        createScopedState<ControlSummary[]>([]),
    );
    const [krisResource, dispatchKris] = useReducer(
        scopedTabReducer<KriOutcome>,
        createScopedState(EMPTY_KRIS),
    );
    const [usersResource, dispatchUsers] = useReducer(
        scopedTabReducer<DeptUser[]>,
        createScopedState<DeptUser[]>([]),
    );

    useEffect(() => {
        if (!departmentId) return;
        const requestId = nextRequestId();
        let cancelled = false;
        dispatchDepartment({ type: 'start', ownerId: departmentId, requestId });
        departmentApi.getDepartment(departmentId)
            .then((data) => {
                if (!cancelled) {
                    dispatchDepartment({
                        type: 'success',
                        ownerId: departmentId,
                        requestId,
                        data: { department: data, isAccessDenied: false, error: null },
                    });
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    const isAccessDenied = isForbiddenApiError(error);
                    dispatchDepartment({
                        type: 'success',
                        ownerId: departmentId,
                        requestId,
                        data: {
                            department: null,
                            isAccessDenied,
                            error: isAccessDenied ? null : 'errors.load_department_detail_failed',
                        },
                    });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, refreshNonce]);

    useEffect(() => {
        if (!departmentId || activeTab !== 'risks') return;
        const requestId = nextRequestId();
        let cancelled = false;
        const params: { skip: number; limit: number; min_net_score?: number } = {
            skip: (riskPage - 1) * DEPARTMENT_PAGE_SIZE,
            limit: DEPARTMENT_PAGE_SIZE,
        };
        if (riskFilter === 'high') params.min_net_score = thresholds.high;
        dispatchRisks({ type: 'start', ownerId: departmentId, requestId });
        departmentApi.getDepartmentRisks(departmentId, params)
            .then((data) => {
                if (!cancelled) dispatchRisks({ type: 'success', ownerId: departmentId, requestId, data });
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    logError('Failed to load department risks.', error);
                    dispatchRisks({ type: 'failure', ownerId: departmentId, requestId, errorKey: TAB_ERROR_KEY });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, riskPage, riskFilter, refreshNonce, thresholds.high]);

    useEffect(() => {
        if (!departmentId || activeTab !== 'controls') return;
        const requestId = nextRequestId();
        let cancelled = false;
        dispatchControls({ type: 'start', ownerId: departmentId, requestId });
        departmentApi.getDepartmentControls(departmentId, {
            skip: (controlPage - 1) * DEPARTMENT_PAGE_SIZE,
            limit: DEPARTMENT_PAGE_SIZE,
        })
            .then((data) => {
                if (!cancelled) dispatchControls({ type: 'success', ownerId: departmentId, requestId, data });
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    logError('Failed to load department controls.', error);
                    dispatchControls({ type: 'failure', ownerId: departmentId, requestId, errorKey: TAB_ERROR_KEY });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, controlPage, refreshNonce]);

    useEffect(() => {
        if (!departmentId || activeTab !== 'kris') return;
        const requestId = nextRequestId();
        let cancelled = false;
        dispatchKris({ type: 'start', ownerId: departmentId, requestId });
        departmentApi.getDepartmentKRIs(departmentId, {
            skip: (kriPage - 1) * DEPARTMENT_PAGE_SIZE,
            limit: DEPARTMENT_PAGE_SIZE,
            monitoring_status: kriFilter === 'all' ? undefined : kriFilter,
        })
            .then((data) => {
                if (!cancelled) {
                    dispatchKris({
                        type: 'success',
                        ownerId: departmentId,
                        requestId,
                        data: { items: data.items, total: data.total },
                    });
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    logError('Failed to load department KRIs.', error);
                    dispatchKris({ type: 'failure', ownerId: departmentId, requestId, errorKey: TAB_ERROR_KEY });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, kriFilter, kriPage, refreshNonce]);

    useEffect(() => {
        if (!departmentId || activeTab !== 'users') return;
        const requestId = nextRequestId();
        let cancelled = false;
        dispatchUsers({ type: 'start', ownerId: departmentId, requestId });
        userApi.listVisibleUsers({
            department_id: departmentId,
            skip: (userPage - 1) * DEPARTMENT_PAGE_SIZE,
            limit: DEPARTMENT_PAGE_SIZE,
        })
            .then((data) => {
                if (!cancelled) dispatchUsers({ type: 'success', ownerId: departmentId, requestId, data });
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    logError('Failed to load department users.', error);
                    dispatchUsers({ type: 'failure', ownerId: departmentId, requestId, errorKey: TAB_ERROR_KEY });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, activeTab, userPage, refreshNonce]);

    const departmentOutcome = dataForOwner(departmentResource, departmentId, EMPTY_DEPARTMENT);
    const risks = dataForOwner(risksResource, departmentId, []);
    const controls = dataForOwner(controlsResource, departmentId, []);
    const kriOutcome = dataForOwner(krisResource, departmentId, EMPTY_KRIS);
    const users = dataForOwner(usersResource, departmentId, []);

    const getRiskCount = () => {
        const department = departmentOutcome.department;
        if (!department) return 0;
        return riskFilter === 'high' ? department.high_risk_count : department.risk_count;
    };

    const refresh = () => {
        if (departmentId) setRefreshNonce((current) => current + 1);
    };

    return {
        department: departmentOutcome.department,
        isLoading: departmentId !== undefined && (
            departmentResource.requestedOwnerId !== departmentId || departmentResource.isLoading
        ),
        isAccessDenied: departmentOutcome.isAccessDenied,
        error: departmentOutcome.error,
        risks,
        controls,
        kris: kriOutcome.items,
        users,
        riskTotalPages: Math.ceil(getRiskCount() / DEPARTMENT_PAGE_SIZE) || 1,
        controlTotalPages: Math.ceil((departmentOutcome.department?.control_count ?? 0) / DEPARTMENT_PAGE_SIZE) || 1,
        kriTotalPages: Math.ceil(kriOutcome.total / DEPARTMENT_PAGE_SIZE) || 1,
        userTotalPages: Math.ceil((departmentOutcome.department?.user_count ?? 0) / DEPARTMENT_PAGE_SIZE) || 1,
        risksState: statusForOwner(risksResource, departmentId),
        controlsState: statusForOwner(controlsResource, departmentId),
        krisState: statusForOwner(krisResource, departmentId),
        usersState: statusForOwner(usersResource, departmentId),
        getRiskCount,
        refresh,
    };
}
