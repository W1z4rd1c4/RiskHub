import { reportApi } from '@/services/reportApi';
import type { DashboardFilters } from '@/types/dashboard';

export async function exportDashboardSummary(filters: DashboardFilters): Promise<void> {
    await reportApi.downloadSummaryCsv({
        departmentId: filters.departmentId,
        riskLevel: filters.riskLevel,
        controlStatus: filters.controlStatus,
        controlForm: filters.controlForm,
    });
}

export function openDashboardPath(
    navigate: (path: string) => void,
    path: string,
): void {
    navigate(path);
}
