import { buildDashboardDrillthrough } from '@/pages/dashboard/dashboardStats';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WidgetShell } from '@/components/dashboard/WidgetShell';
import { useDashboardFilterMutators, useDashboardFilterSelector } from '../../contexts/DashboardFilterContext';
import type { DepartmentMetrics } from '../../types/dashboard';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useTranslation } from '@/i18n/hooks';
import { DepartmentMetricRow } from './departmentTablePresentation';
import {
    type DepartmentSortDirection,
    type DepartmentSortKey,
    sortDepartmentMetrics,
} from './departmentTableSorting';

interface DepartmentTableProps {
    canUseDepartmentFilter: boolean;
    canReadDepartments?: boolean;
    metrics: DepartmentMetrics[];
}

export function DepartmentTable({ canUseDepartmentFilter, canReadDepartments, metrics }: DepartmentTableProps) {
    const { t } = useTranslation('dashboard');
    const navigate = useNavigate();
    const filters = useDashboardFilterSelector(state => state.filters);
    const departmentId = filters.departmentId;
    const { setDepartmentId } = useDashboardFilterMutators();
    const [sortKey, setSortKey] = useState<DepartmentSortKey>('department_name');
    const [sortDirection, setSortDirection] = useState<DepartmentSortDirection>('asc');

    const handleSort = (key: DepartmentSortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const sortedMetrics = sortDepartmentMetrics(metrics, sortKey, sortDirection);

    const sortableHeader = (key: DepartmentSortKey, labelKey: string, align: 'left' | 'center') => (
        <TH
            align={align}
            onSort={() => handleSort(key)}
            sortDirection={sortKey === key ? sortDirection : null}
        >
            {t(labelKey)}
        </TH>
    );

    return (
        <WidgetShell title={t('department_table.title')}>
            {canReadDepartments !== true && <p className="p-3 text-sm text-muted-foreground">{t('destinations.department_unavailable')}</p>}
            {/* GAP-D-10: sortable headers are buttons with `aria-sort` on the `th` (ui/table, D14). */}
            <Table className="text-left" regionLabel={t('department_table.title')}>
                <THead>
                    <TR>
                        {sortableHeader('department_name', 'department_table.columns.department', 'left')}
                        {sortableHeader('control_count', 'department_table.columns.controls', 'center')}
                        {sortableHeader('risk_count', 'department_table.columns.risks', 'center')}
                        {sortableHeader('audited_control_count', 'department_table.columns.audited', 'center')}
                        {sortableHeader('breaching_kri_count', 'department_table.columns.kri_breaches', 'center')}
                        <TH align="right">{t('department_table.columns.quick_actions')}</TH>
                    </TR>
                </THead>
                <TBody>
                    {sortedMetrics.map((dept) => {
                        const isSelected = canUseDepartmentFilter && departmentId === dept.department_id;
                        return (
                            <DepartmentMetricRow
                                unavailableReason={canReadDepartments === true ? undefined : t('destinations.department_unavailable')}
                                canUseDepartmentFilter={canUseDepartmentFilter}
                                key={dept.department_id}
                                dept={dept}
                                destinations={buildDashboardDrillthrough({ ...filters, departmentId: dept.department_id })}
                                isSelected={isSelected}
                                navigate={navigate}
                                setDepartmentId={setDepartmentId}
                                t={t}
                            />
                        );
                    })}
                    {metrics.length === 0 && (
                        <TR>
                            <TD colSpan={6}>
                                <EmptyState layout="section" title={t('department_table.empty')} className="py-8" />
                            </TD>
                        </TR>
                    )}
                </TBody>
            </Table>
        </WidgetShell>
    );
}
