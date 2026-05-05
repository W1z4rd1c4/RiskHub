import type { ActivityLogFilters } from '@/services/activityLogApi';

export type ViewMode = 'chronological' | 'by_person' | 'by_department' | 'by_risk';
export type ActiveTab = 'kri' | 'risk' | 'control' | 'user';

interface ActivityLogViewModeTransitionInput {
    nextMode: ViewMode;
    selectedActorId: number | null;
    selectedDepartmentId: number | null;
    selectedRiskId: number | null;
}

interface ActivityLogSelectorState {
    selectedActorId: number | null;
    selectedDepartmentId: number | null;
    selectedRiskId: number | null;
}

export function transitionActivityLogViewMode({
    nextMode,
    selectedActorId,
    selectedDepartmentId,
    selectedRiskId,
}: ActivityLogViewModeTransitionInput): ActivityLogSelectorState {
    return {
        selectedActorId: nextMode === 'by_person' ? selectedActorId : null,
        selectedDepartmentId: nextMode === 'by_department' ? selectedDepartmentId : null,
        selectedRiskId: nextMode === 'by_risk' ? selectedRiskId : null,
    };
}

export function activityLogEntityTypes({
    viewMode,
    selectedRiskId,
    activeTab,
}: {
    viewMode: ViewMode;
    selectedRiskId: number | null;
    activeTab: ActiveTab;
}): string[] | undefined {
    if (viewMode === 'by_risk' && selectedRiskId) {
        return ['risk'];
    }

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
}

export function buildActivityLogFilters({
    page,
    limit,
    search,
    entityTypes,
    entityId,
    viewMode,
    selectedActorId,
    selectedDepartmentId,
    action,
    dateFrom,
    dateTo,
}: {
    page: number;
    limit: number;
    search: string;
    entityTypes: string[] | undefined;
    entityId: number | undefined;
    viewMode: ViewMode;
    selectedActorId: number | null;
    selectedDepartmentId: number | null;
    action: string;
    dateFrom: string;
    dateTo: string;
}): ActivityLogFilters {
    return {
        skip: page * limit,
        limit,
        search: search || undefined,
        entity_type: entityTypes,
        entity_id: entityId,
        actor_id: viewMode === 'by_person' && selectedActorId ? selectedActorId : undefined,
        department_id: viewMode === 'by_department' && selectedDepartmentId ? selectedDepartmentId : undefined,
        action: action || undefined,
        date_from: dateFrom ? `${dateFrom}T00:00:00.000` : undefined,
        date_to: dateTo ? `${dateTo}T23:59:59.999` : undefined,
    };
}
