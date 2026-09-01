import {
    createContext,
    useContext,
    useMemo,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import type { ControlForm, ControlStatus } from '@/types/control';

export type RiskLevel = 'all' | 'critical' | 'high' | 'medium' | 'low';
export type ViewMode = 'executive' | 'department';

export interface DashboardFilters {
    departmentId: number | null;
    riskLevel: RiskLevel;
    controlStatus: ControlStatus | null;
    controlForm: ControlForm | null;
}

export interface DashboardFilterSnapshot {
    filters: DashboardFilters;
    viewMode: ViewMode;
    hasActiveFilters: boolean;
}

interface DashboardFilterMutators {
    setDepartmentId: (id: number | null) => void;
    setRiskLevel: (level: RiskLevel) => void;
    setControlStatus: (status: ControlStatus | null) => void;
    setControlForm: (form: ControlForm | null) => void;
    setViewMode: (mode: ViewMode) => void;
    resetFilters: () => void;
    replaceSnapshot: (snapshot: Pick<DashboardFilterSnapshot, 'filters' | 'viewMode'>) => void;
}

const defaultFilters: DashboardFilters = {
    departmentId: null,
    riskLevel: 'all',
    controlStatus: null,
    controlForm: null,
};

type DashboardFilterContextType = DashboardFilterSnapshot & DashboardFilterMutators;
type DashboardFilterListener = () => void;

interface DashboardFilterStore extends DashboardFilterMutators {
    getSnapshot: () => DashboardFilterSnapshot;
    subscribe: (listener: DashboardFilterListener) => () => void;
}

const defaultSnapshot: DashboardFilterSnapshot = {
    filters: defaultFilters,
    viewMode: 'executive',
    hasActiveFilters: false,
};

const DashboardFilterStoreContext = createContext<DashboardFilterStore | undefined>(undefined);

function hasActiveFilters(filters: DashboardFilters) {
    return (
        filters.departmentId !== null ||
        filters.riskLevel !== 'all' ||
        filters.controlStatus !== null ||
        filters.controlForm !== null
    );
}

function buildSnapshot(filters: DashboardFilters, viewMode: ViewMode): DashboardFilterSnapshot {
    return {
        filters,
        viewMode,
        hasActiveFilters: hasActiveFilters(filters),
    };
}

function createDashboardFilterStore(): DashboardFilterStore {
    let snapshot = defaultSnapshot;
    const listeners = new Set<DashboardFilterListener>();

    const emit = (next: DashboardFilterSnapshot) => {
        if (Object.is(next, snapshot)) {
            return;
        }
        snapshot = next;
        listeners.forEach(listener => listener());
    };

    const updateSnapshot = (updater: (current: DashboardFilterSnapshot) => DashboardFilterSnapshot) => {
        emit(updater(snapshot));
    };

    const updateFilters = (updater: (current: DashboardFilters) => DashboardFilters, nextViewMode?: ViewMode) => {
        updateSnapshot(current => {
            const filters = updater(current.filters);
            const viewMode = nextViewMode ?? current.viewMode;
            if (filters === current.filters && viewMode === current.viewMode) {
                return current;
            }
            return buildSnapshot(filters, viewMode);
        });
    };

    return {
        getSnapshot: () => snapshot,
        subscribe: (listener: DashboardFilterListener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        setDepartmentId: (id: number | null) => {
            updateSnapshot(current => {
                const nextViewMode = id !== null ? 'department' : current.viewMode;
                if (current.filters.departmentId === id && current.viewMode === nextViewMode) {
                    return current;
                }
                return buildSnapshot({ ...current.filters, departmentId: id }, nextViewMode);
            });
        },
        setRiskLevel: (level: RiskLevel) => {
            updateFilters(current => current.riskLevel === level ? current : { ...current, riskLevel: level });
        },
        setControlStatus: (status: ControlStatus | null) => {
            updateFilters(current => current.controlStatus === status ? current : { ...current, controlStatus: status });
        },
        setControlForm: (form: ControlForm | null) => {
            updateFilters(current => current.controlForm === form ? current : { ...current, controlForm: form });
        },
        setViewMode: (mode: ViewMode) => {
            updateSnapshot(current => current.viewMode === mode ? current : buildSnapshot(current.filters, mode));
        },
        resetFilters: () => {
            updateSnapshot(current => {
                if (current.filters === defaultFilters && current.viewMode === 'executive') {
                    return current;
                }
                return defaultSnapshot;
            });
        },
        replaceSnapshot: (next) => {
            updateSnapshot(current => {
                if (
                    current.viewMode === next.viewMode
                    && current.filters.departmentId === next.filters.departmentId
                    && current.filters.riskLevel === next.filters.riskLevel
                    && current.filters.controlStatus === next.filters.controlStatus
                    && current.filters.controlForm === next.filters.controlForm
                ) {
                    return current;
                }
                return buildSnapshot(next.filters, next.viewMode);
            });
        },
    };
}

function useDashboardFilterStore() {
    const store = useContext(DashboardFilterStoreContext);
    if (store === undefined) {
        throw new Error('useDashboardFilters must be used within a DashboardFilterProvider');
    }
    return store;
}

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
    const [store] = useState(createDashboardFilterStore);

    return (
        <DashboardFilterStoreContext.Provider value={store}>
            {children}
        </DashboardFilterStoreContext.Provider>
    );
}

export function useDashboardFilterSelector<T>(selector: (state: DashboardFilterSnapshot) => T): T {
    const store = useDashboardFilterStore();
    return useSyncExternalStore(
        store.subscribe,
        () => selector(store.getSnapshot()),
        () => selector(store.getSnapshot()),
    );
}

export function useDashboardFilterMutators(): DashboardFilterMutators {
    const store = useDashboardFilterStore();
    return useMemo(
        () => ({
            setDepartmentId: store.setDepartmentId,
            setRiskLevel: store.setRiskLevel,
            setControlStatus: store.setControlStatus,
            setControlForm: store.setControlForm,
            setViewMode: store.setViewMode,
            resetFilters: store.resetFilters,
            replaceSnapshot: store.replaceSnapshot,
        }),
        [store],
    );
}

export function useDashboardFilters(): DashboardFilterContextType {
    const snapshot = useDashboardFilterSelector(state => state);
    const mutators = useDashboardFilterMutators();
    return useMemo(
        () => ({
            ...snapshot,
            ...mutators,
        }),
        [mutators, snapshot],
    );
}
