import { reportApi } from '@/services/reportApi';

export function exportDashboardSummary(departmentId: number | null): void {
    void reportApi.downloadSummaryCsv({ departmentId });
}

export function openDashboardPath(
    navigate: (path: string) => void,
    path: string,
): void {
    navigate(path);
}
