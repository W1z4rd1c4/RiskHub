import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WidgetShell } from '@/components/dashboard/WidgetShell';
import { useDashboardFilterMutators, useDashboardFilterSelector } from '../../contexts/DashboardFilterContext';
import type { DepartmentMetrics } from '../../types/dashboard';
import { useTranslation } from '@/i18n/hooks';
import {
    DepartmentMetricRow,
    SortIcon,
} from './departmentTablePresentation';
import {
    type DepartmentSortDirection,
    type DepartmentSortKey,
    sortDepartmentMetrics,
} from './departmentTableSorting';

interface DepartmentTableProps {
    canUseDepartmentFilter: boolean;
    metrics: DepartmentMetrics[];
}

export function DepartmentTable({ canUseDepartmentFilter, metrics }: DepartmentTableProps) {
    const { t } = useTranslation('dashboard');
    const navigate = useNavigate();
    const departmentId = useDashboardFilterSelector(state => state.filters.departmentId);
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

    return (
        <WidgetShell title={t('department_table.title', 'Department metrics')}>
            <div className="w-full overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-white/5">
                            <th
                                className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('department_name')}
                            >
                                <div className="flex items-center gap-1">
                                    {t('department_table.columns.department')}
                                    <SortIcon columnKey="department_name" sortKey={sortKey} sortDirection={sortDirection} />
                                </div>
                            </th>
                            <th
                                className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('control_count')}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    {t('department_table.columns.controls')}
                                    <SortIcon columnKey="control_count" sortKey={sortKey} sortDirection={sortDirection} />
                                </div>
                            </th>
                            <th
                                className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('risk_count')}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    {t('department_table.columns.risks')}
                                    <SortIcon columnKey="risk_count" sortKey={sortKey} sortDirection={sortDirection} />
                                </div>
                            </th>
                            <th
                                className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('audited_control_count')}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    {t('department_table.columns.audited')}
                                    <SortIcon columnKey="audited_control_count" sortKey={sortKey} sortDirection={sortDirection} />
                                </div>
                            </th>
                            <th
                                className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('breaching_kri_count')}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    {t('department_table.columns.kri_breaches')}
                                    <SortIcon columnKey="breaching_kri_count" sortKey={sortKey} sortDirection={sortDirection} />
                                </div>
                            </th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">
                                {t('department_table.columns.quick_actions')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {sortedMetrics.map((dept) => {
                            const isSelected = canUseDepartmentFilter && departmentId === dept.department_id;
                            return (
                                <DepartmentMetricRow
                                    canUseDepartmentFilter={canUseDepartmentFilter}
                                    key={dept.department_id}
                                    dept={dept}
                                    isSelected={isSelected}
                                    navigate={navigate}
                                    setDepartmentId={setDepartmentId}
                                    t={t}
                                />
                            );
                        })}
                        {metrics.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center">
                                    <span className="text-slate-500 font-medium">{t('department_table.empty')}</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </WidgetShell>
    );
}
