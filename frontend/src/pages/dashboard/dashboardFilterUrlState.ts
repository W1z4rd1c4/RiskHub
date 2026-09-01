import type {
    DashboardFilters,
    DashboardFilterSnapshot,
    RiskLevel,
    ViewMode,
} from '@/contexts/DashboardFilterContext';
import { ControlForm, ControlStatus } from '@/types/control';

type DashboardFilterUrlState = Pick<DashboardFilterSnapshot, 'filters' | 'viewMode'>;

const OWNED_KEYS = ['departmentId', 'riskLevel', 'controlStatus', 'controlForm', 'viewMode'] as const;
const RISK_LEVELS: readonly RiskLevel[] = ['all', 'critical', 'high', 'medium', 'low'];
const CONTROL_STATUSES = [ControlStatus.DRAFT, ControlStatus.ACTIVE, ControlStatus.INACTIVE] as const;
const CONTROL_FORMS = [ControlForm.MANUAL, ControlForm.AUTOMATIC] as const;
const VIEW_MODES: readonly ViewMode[] = ['executive', 'department'];

function allowedValue<T extends string>(raw: string | null, allowed: readonly T[]): T | null {
    return raw !== null && allowed.includes(raw as T) ? raw as T : null;
}

function positiveInteger(raw: string | null): number | null {
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function parseDashboardFilterUrlState(params: URLSearchParams): DashboardFilterUrlState {
    const departmentId = positiveInteger(params.get('departmentId'));
    const requestedViewMode = allowedValue(params.get('viewMode'), VIEW_MODES) ?? 'executive';

    return {
        filters: {
            departmentId,
            riskLevel: allowedValue(params.get('riskLevel'), RISK_LEVELS) ?? 'all',
            controlStatus: allowedValue(params.get('controlStatus'), CONTROL_STATUSES),
            controlForm: allowedValue(params.get('controlForm'), CONTROL_FORMS),
        },
        viewMode: departmentId !== null ? 'department' : requestedViewMode,
    };
}

export function buildDashboardFilterUrlParams(
    filters: DashboardFilters,
    viewMode: ViewMode,
    existingParams = new URLSearchParams(),
): URLSearchParams {
    const params = new URLSearchParams(existingParams);
    OWNED_KEYS.forEach((key) => params.delete(key));

    if (filters.departmentId !== null) params.set('departmentId', String(filters.departmentId));
    if (filters.riskLevel !== 'all') params.set('riskLevel', filters.riskLevel);
    if (filters.controlStatus !== null) params.set('controlStatus', filters.controlStatus);
    if (filters.controlForm !== null) params.set('controlForm', filters.controlForm);
    if (viewMode !== 'executive') params.set('viewMode', viewMode);

    return params;
}

export function dashboardFilterSnapshotsEqual(
    current: Pick<DashboardFilterSnapshot, 'filters' | 'viewMode'>,
    next: Pick<DashboardFilterSnapshot, 'filters' | 'viewMode'>,
): boolean {
    return current.viewMode === next.viewMode
        && current.filters.departmentId === next.filters.departmentId
        && current.filters.riskLevel === next.filters.riskLevel
        && current.filters.controlStatus === next.filters.controlStatus
        && current.filters.controlForm === next.filters.controlForm;
}
