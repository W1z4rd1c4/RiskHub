import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { DepartmentMetrics } from '../../types/dashboard';

interface DepartmentTableProps {
    metrics: DepartmentMetrics[];
}

export function DepartmentTable({ metrics }: DepartmentTableProps) {
    const navigate = useNavigate();

    return (
        <div className="w-full overflow-hidden">
            <table className="w-full text-left">
                <thead>
                    <tr className="border-b border-white/5">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Department</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Controls</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Risks</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Compliance</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {metrics.map((dept) => (
                        <tr
                            key={dept.department_id}
                            className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => navigate(`/risks?department=${dept.department_id}`)}
                        >
                            <td className="px-6 py-4">
                                <span className="text-sm font-bold text-white group-hover:text-accent transition-colors">
                                    {dept.department_name}
                                </span>
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
                            <td className="px-6 py-4">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 ${dept.compliance_rate >= 0.9 ? 'bg-emerald-500' :
                                                dept.compliance_rate >= 0.7 ? 'bg-amber-500' :
                                                    'bg-rose-500'
                                                }`}
                                            style={{ width: `${dept.compliance_rate * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-400">
                                        {(dept.compliance_rate * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button className="p-2 text-slate-500 group-hover:text-white transition-colors">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {metrics.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-12 text-center">
                                <span className="text-slate-500 font-medium">No department data available</span>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
