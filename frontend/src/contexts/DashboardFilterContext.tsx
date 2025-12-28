import { createContext, useContext, useState, type ReactNode } from 'react';

export type RiskLevel = 'all' | 'critical' | 'high' | 'medium' | 'low';
export type ViewMode = 'executive' | 'department';

export interface DashboardFilters {
    departmentId: number | null;
    riskLevel: RiskLevel;
    controlStatus: string | null;
    controlForm: string | null;
}

interface DashboardFilterContextType {
    filters: DashboardFilters;
    viewMode: ViewMode;
    setDepartmentId: (id: number | null) => void;
    setRiskLevel: (level: RiskLevel) => void;
    setControlStatus: (status: string | null) => void;
    setControlForm: (form: string | null) => void;
    setViewMode: (mode: ViewMode) => void;
    resetFilters: () => void;
    hasActiveFilters: boolean;
}

const defaultFilters: DashboardFilters = {
    departmentId: null,
    riskLevel: 'all',
    controlStatus: null,
    controlForm: null,
};

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
    const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
    const [viewMode, setViewMode] = useState<ViewMode>('executive');

    const setDepartmentId = (id: number | null) => {
        setFilters(prev => ({ ...prev, departmentId: id }));
        // Auto-switch to department view when department selected
        if (id !== null) {
            setViewMode('department');
        }
    };

    const setRiskLevel = (level: RiskLevel) => {
        setFilters(prev => ({ ...prev, riskLevel: level }));
    };

    const setControlStatus = (status: string | null) => {
        setFilters(prev => ({ ...prev, controlStatus: status }));
    };

    const setControlForm = (form: string | null) => {
        setFilters(prev => ({ ...prev, controlForm: form }));
    };

    const resetFilters = () => {
        setFilters(defaultFilters);
        setViewMode('executive');
    };

    const hasActiveFilters =
        filters.departmentId !== null ||
        filters.riskLevel !== 'all' ||
        filters.controlStatus !== null ||
        filters.controlForm !== null;

    return (
        <DashboardFilterContext.Provider
            value={{
                filters,
                viewMode,
                setDepartmentId,
                setRiskLevel,
                setControlStatus,
                setControlForm,
                setViewMode,
                resetFilters,
                hasActiveFilters,
            }}
        >
            {children}
        </DashboardFilterContext.Provider>
    );
}

export function useDashboardFilters() {
    const context = useContext(DashboardFilterContext);
    if (context === undefined) {
        throw new Error('useDashboardFilters must be used within a DashboardFilterProvider');
    }
    return context;
}
