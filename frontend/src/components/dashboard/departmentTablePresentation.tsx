import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Target } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import type { SafeTFunction } from '@/i18n/hooks';
import type { DepartmentMetrics } from '@/types/dashboard';
import type { DepartmentSortDirection, DepartmentSortKey } from './departmentTableSorting';

export function SortIcon({
    columnKey,
    sortDirection,
    sortKey,
}: {
    columnKey: DepartmentSortKey;
    sortKey: DepartmentSortKey;
    sortDirection: DepartmentSortDirection;
}) {
    if (sortKey !== columnKey) {
        return <div className="w-3 h-3" />;
    }
    return sortDirection === 'asc'
        ? <ChevronUp className="w-3 h-3 text-accent" />
        : <ChevronDown className="w-3 h-3 text-accent" />;
}

interface DepartmentQuickActionsProps {
    departmentId: number;
    isSelected: boolean;
    navigate: NavigateFunction;
    setDepartmentId: (id: number | null) => void;
    t: SafeTFunction;
}

function DepartmentQuickActions({
    departmentId,
    isSelected,
    navigate,
    setDepartmentId,
    t,
}: DepartmentQuickActionsProps) {
    return (
        <div className="flex items-center justify-end gap-1">
            <div className="relative group/tooltip">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        void navigate(`/controls?department=${departmentId}`);
                    }}
                    aria-label={t('department_table.actions.view_controls')}
                    title={t('department_table.actions.view_controls')}
                    className="p-1.5 text-slate-500 hover:text-accent hover:bg-accent/10 rounded-md transition-colors"
                >
                    <ClipboardList className="h-4 w-4" />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-slate-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {t('department_table.actions.view_controls')}
                </span>
            </div>
            <div className="relative group/tooltip">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        void navigate(`/risks?department=${departmentId}`);
                    }}
                    aria-label={t('department_table.actions.view_risks')}
                    title={t('department_table.actions.view_risks')}
                    className="p-1.5 text-slate-500 hover:text-orange-400 hover:bg-orange-400/10 rounded-md transition-colors"
                >
                    <AlertTriangle className="h-4 w-4" />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-slate-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {t('department_table.actions.view_risks')}
                </span>
            </div>
            <div className="relative group/tooltip">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setDepartmentId(isSelected ? null : departmentId);
                    }}
                    aria-label={
                        isSelected
                            ? t('department_table.actions.remove_focus')
                            : t('department_table.actions.set_focus')
                    }
                    title={
                        isSelected
                            ? t('department_table.actions.remove_focus')
                            : t('department_table.actions.set_focus')
                    }
                    className={`p-1.5 rounded-md transition-colors ${isSelected
                        ? 'text-accent bg-accent/10'
                        : 'text-slate-500 hover:text-purple-400 hover:bg-purple-400/10'
                        }`}
                >
                    <Target className="h-4 w-4" />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-slate-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {isSelected
                        ? t('department_table.actions.remove_focus')
                        : t('department_table.actions.set_focus')}
                </span>
            </div>
            <div className="relative group/tooltip">
                <button
                    onClick={() => navigate(`/risks?department=${departmentId}`)}
                    aria-label={t('department_table.actions.go_to_department')}
                    title={t('department_table.actions.go_to_department')}
                    className="p-1.5 text-slate-500 group-hover:text-white transition-colors"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-slate-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {t('department_table.actions.go_to_department')}
                </span>
            </div>
        </div>
    );
}

export function DepartmentMetricRow({
    dept,
    isSelected,
    navigate,
    setDepartmentId,
    t,
}: {
    dept: DepartmentMetrics;
    isSelected: boolean;
    navigate: NavigateFunction;
    setDepartmentId: (id: number | null) => void;
    t: SafeTFunction;
}) {
    return (
        <tr
            className={`group transition-colors ${isSelected
                ? 'bg-accent/10 border-l-2 border-l-accent'
                : 'hover:bg-white/[0.02]'
                } ${dept.breaching_kri_count > 0 ? 'border-l-2 border-l-rose-500/50' : ''}`}
        >
            <td className="px-6 py-4">
                <button
                    onClick={() => setDepartmentId(dept.department_id)}
                    className="text-left"
                >
                    <span className={`text-sm font-bold transition-colors ${isSelected ? 'text-accent' : 'text-white group-hover:text-accent'
                        }`}>
                        {dept.department_name}
                    </span>
                    {isSelected && (
                        <span className="ml-2 text-[9px] font-bold text-accent uppercase tracking-wider">
                            {t('department_table.focused')}
                        </span>
                    )}
                </button>
            </td>
            <td className="px-6 py-4 text-center">
                <span className="text-sm font-mono text-slate-300">{dept.control_count}</span>
            </td>
            <td className="px-6 py-4 text-center">
                <div className="flex flex-col items-center">
                    <span className="text-sm font-mono text-slate-300">{dept.risk_count}</span>
                    {dept.high_risk_count > 0 && (
                        <span className="text-[10px] font-black text-rose-400 uppercase tracking-tighter mt-0.5">
                            {dept.high_risk_count} {t('department_table.high')}
                        </span>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 text-center">
                <div className="flex flex-col items-center">
                    <span className={`text-sm font-mono ${dept.audited_control_count > 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                        {dept.audited_control_count}/{dept.control_count}
                    </span>
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter mt-0.5">
                        {t('department_table.audited')}
                    </span>
                </div>
            </td>
            <td className="px-6 py-4 text-center">
                <div className="flex flex-col items-center">
                    <span className={`text-sm font-mono ${dept.breaching_kri_count > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                        {dept.breaching_kri_count}/{dept.total_kri_count}
                    </span>
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter mt-0.5">
                        {t('department_table.breached')}
                    </span>
                </div>
            </td>
            <td className="px-6 py-4">
                <DepartmentQuickActions
                    departmentId={dept.department_id}
                    isSelected={isSelected}
                    navigate={navigate}
                    setDepartmentId={setDepartmentId}
                    t={t}
                />
            </td>
        </tr>
    );
}
