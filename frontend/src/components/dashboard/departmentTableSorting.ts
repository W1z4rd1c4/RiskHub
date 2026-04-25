import type { DepartmentMetrics } from '@/types/dashboard';

export type DepartmentSortKey =
    | 'department_name'
    | 'control_count'
    | 'risk_count'
    | 'high_risk_count'
    | 'audited_control_count'
    | 'breaching_kri_count';
export type DepartmentSortDirection = 'asc' | 'desc';

export function sortDepartmentMetrics(
    metrics: DepartmentMetrics[],
    sortKey: DepartmentSortKey,
    sortDirection: DepartmentSortDirection,
): DepartmentMetrics[] {
    return [...metrics].sort((a, b) => {
        let aVal: string | number = a[sortKey];
        let bVal: string | number = b[sortKey];

        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = (bVal as string).toLowerCase();
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}
