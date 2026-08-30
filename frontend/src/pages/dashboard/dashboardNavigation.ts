import { reportApi } from '@/services/reportApi';

export async function exportDashboardSummary(departmentId: number | null): Promise<void> {
    await reportApi.downloadSummaryCsv({ departmentId });
}

export function openDashboardPath(
    navigate: (path: string) => void,
    path: string,
): void {
    navigate(path);
}
