import type { DashboardFilters } from '@/types/dashboard';

export const dashboardKeys = {
    shellSummary: (
        userId: number | undefined,
        departmentId: number | null,
        accessScope: string | null,
    ) => ['shellSummary', userId, departmentId, accessScope] as const,
    overview: (filters: DashboardFilters) => [
        'dashboardOverview',
        filters.departmentId,
        filters.riskLevel,
        filters.controlStatus,
        filters.controlForm,
    ] as const,
};
