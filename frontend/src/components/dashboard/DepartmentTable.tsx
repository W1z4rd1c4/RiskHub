import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronUp, ChevronDown, ClipboardList, AlertTriangle, Target } from 'lucide-react';
import { useDashboardFilters } from '../../contexts/DashboardFilterContext';
import type { DepartmentMetrics } from '../../types/dashboard';

interface DepartmentTableProps {
    metrics: DepartmentMetrics[];
}

type SortKey = 'department_name' | 'control_count' | 'risk_count' | 'high_risk_count' | 'audited_control_count' | 'breaching_kri_count';
type SortDirection = 'asc' | 'desc';

// Moved outside component to avoid re-creation during render
function SortIcon({ columnKey, sortKey, sortDirection }: { columnKey: SortKey; sortKey: SortKey; sortDirection: SortDirection }) {
    if (sortKey !== columnKey) {
        return <div className="w-3 h-3" />;
    }
    return sortDirection === 'asc'
        ? <ChevronUp className="w-3 h-3 text-accent" />
        : <ChevronDown className="w-3 h-3 text-accent" />;
}

export function DepartmentTable({ metrics }: DepartmentTableProps) {
    const navigate = useNavigate();
    const { filters, setDepartmentId } = useDashboardFilters();
    const [sortKey, setSortKey] = useState<SortKey>('department_name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const sortedMetrics = [...metrics].sort((a, b) => {
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

    return (
        <div className="w-full overflow-hidden">
            <table className="w-full text-left">
                <thead>
                    <tr className="border-b border-white/5">
                        <th
                            className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('department_name')}
                        >
                            <div className="flex items-center gap-1">
                                Department
                                <SortIcon columnKey="department_name" sortKey={sortKey} sortDirection={sortDirection} />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('control_count')}
                        >
                            <div className="flex items-center justify-center gap-1">
                                Controls
                                <SortIcon columnKey="control_count" sortKey={sortKey} sortDirection={sortDirection} />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('risk_count')}
                        >
                            <div className="flex items-center justify-center gap-1">
                                Risks
                                <SortIcon columnKey="risk_count" sortKey={sortKey} sortDirection={sortDirection} />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('audited_control_count')}
                        >
                            <div className="flex items-center justify-center gap-1">
                                Audited
                                <SortIcon columnKey="audited_control_count" sortKey={sortKey} sortDirection={sortDirection} />
                            </div>
                        </th>
                        <th
                            className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('breaching_kri_count')}
                        >
                            <div className="flex items-center justify-center gap-1">
                                KRI Breaches
                                <SortIcon columnKey="breaching_kri_count" sortKey={sortKey} sortDirection={sortDirection} />
                            </div>
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">
                            Quick Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {sortedMetrics.map((dept) => {
                        const isSelected = filters.departmentId === dept.department_id;
                        return (
                            <tr
                                key={dept.department_id}
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
                                                Focused
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
                                                {dept.high_risk_count} High
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
                                            Audited
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className={`text-sm font-mono ${dept.breaching_kri_count > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                                            {dept.breaching_kri_count}/{dept.total_kri_count}
                                        </span>
                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter mt-0.5">
                                            Breached
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-end gap-1">
                                        <div className="relative group/tooltip">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/controls?department=${dept.department_id}`);
                                                }}
                                                className="p-1.5 text-slate-500 hover:text-accent hover:bg-accent/10 rounded-md transition-colors"
                                            >
                                                <ClipboardList className="h-4 w-4" />
                                            </button>
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-slate-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                                View Controls
                                            </span>
                                        </div>
                                        <div className="relative group/tooltip">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/risks?department=${dept.department_id}`);
                                                }}
                                                className="p-1.5 text-slate-500 hover:text-orange-400 hover:bg-orange-400/10 rounded-md transition-colors"
                                            >
                                                <AlertTriangle className="h-4 w-4" />
                                            </button>
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-slate-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                                View Risks
                                            </span>
                                        </div>
                                        <div className="relative group/tooltip">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Toggle focus - if already focused, unfocus
                                                    setDepartmentId(isSelected ? null : dept.department_id);
                                                }}
                                                className={`p-1.5 rounded-md transition-colors ${isSelected
                                                    ? 'text-accent bg-accent/10'
                                                    : 'text-slate-500 hover:text-purple-400 hover:bg-purple-400/10'
                                                    }`}
                                            >
                                                <Target className="h-4 w-4" />
                                            </button>
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-slate-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                                {isSelected ? 'Remove Focus' : 'Set as Focus'}
                                            </span>
                                        </div>
                                        <div className="relative group/tooltip">
                                            <button
                                                onClick={() => navigate(`/risks?department=${dept.department_id}`)}
                                                className="p-1.5 text-slate-500 group-hover:text-white transition-colors"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-slate-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                                Go to Department
                                            </span>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    {metrics.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center">
                                <span className="text-slate-500 font-medium">No department data available</span>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
