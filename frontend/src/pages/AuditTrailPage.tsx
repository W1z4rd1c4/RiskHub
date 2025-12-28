import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ClipboardCheck,
    Filter,
    ChevronRight,
    User,
    CheckCircle,
    XCircle,
    AlertTriangle,
    MinusCircle,
    History,
    ArrowLeft,
    FileText,
    Sheet
} from 'lucide-react';
import { executionApi } from '@/services/executionApi';
import type { ControlExecution, ExecutionResult } from '@/services/executionApi';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.05 }
    }
};

const itemItem = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};

export function AuditTrailPage() {
    const navigate = useNavigate();

    const [executions, setExecutions] = useState<ControlExecution[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [resultFilter, setResultFilter] = useState<ExecutionResult | ''>('');
    const [skip] = useState(0);
    const limit = 50;

    const fetchExecutions = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await executionApi.getExecutions({
                skip,
                limit,
                result: resultFilter || undefined
            });
            setExecutions(data);
        } catch (err) {
            console.error('Failed to fetch audit trail:', err);
        } finally {
            setIsLoading(false);
        }
    }, [skip, resultFilter]);

    useEffect(() => {
        fetchExecutions();
    }, [fetchExecutions]);

    const getResultIcon = (result: ExecutionResult) => {
        switch (result) {
            case 'pass': return <CheckCircle className="h-4 w-4 text-emerald-400" />;
            case 'fail': return <XCircle className="h-4 w-4 text-rose-400" />;
            case 'issues_found': return <AlertTriangle className="h-4 w-4 text-amber-400" />;
            case 'not_applicable': return <MinusCircle className="h-4 w-4 text-slate-400" />;
        }
    };

    const getResultColor = (result: ExecutionResult) => {
        switch (result) {
            case 'pass': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'fail': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
            case 'issues_found': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            case 'not_applicable': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-2">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-4"
                    >
                        <ArrowLeft className="h-3 w-3" /> Back
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-accent/10 border border-accent/20 rounded-2xl">
                            <History className="h-8 w-8 text-accent" />
                        </div>
                        <div>
                            <h2 className="text-4xl font-black text-white tracking-tighter">Audit Trail</h2>
                            <p className="text-slate-500 font-medium max-w-2xl">Global log of all control executions and compliance checks.</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                        <button className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all bg-white/5 rounded-lg border border-white/5 flex items-center gap-2 opacity-50 cursor-not-allowed">
                            <FileText className="h-3.5 w-3.5" />
                            PDF <span className="text-[8px] opacity-40">(CS)</span>
                        </button>
                        <button className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all flex items-center gap-2 opacity-50 cursor-not-allowed">
                            <Sheet className="h-3.5 w-3.5" />
                            Excel <span className="text-[8px] opacity-40">(CS)</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 glass-card flex items-center gap-4 !py-3">
                    <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10 group focus-within:border-accent/50 transition-all flex-1">
                        <Filter className="h-4 w-4 text-slate-500 group-focus-within:text-accent" />
                        <select
                            value={resultFilter}
                            onChange={(e) => setResultFilter(e.target.value as ExecutionResult | '')}
                            className="bg-transparent border-none outline-none text-sm text-white w-full appearance-none cursor-pointer"
                        >
                            <option value="" className="bg-slate-900">All Results</option>
                            <option value="pass" className="bg-slate-900">Pass</option>
                            <option value="fail" className="bg-slate-900">Fail</option>
                            <option value="issues_found" className="bg-slate-900">Issues Found</option>
                            <option value="not_applicable" className="bg-slate-900">N/A</option>
                        </select>
                    </div>

                    <div className="h-8 w-px bg-white/10 hidden md:block" />

                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 px-4">
                        <ClipboardCheck className="h-4 w-4" />
                        {executions.length} Total Records
                    </div>
                </div>
            </div>

            <div className="glass-card !p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Date/Time</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Control</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Executor</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Result</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Key Finding</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Action</th>
                            </tr>
                        </thead>
                        <motion.tbody
                            variants={container}
                            initial="hidden"
                            animate="show"
                            key={resultFilter}
                        >
                            {isLoading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={`skeleton-${i}`} className="border-b border-white/5 animate-pulse">
                                        <td className="px-6 py-6"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-48 bg-white/5 rounded" /></td>
                                        <td className="px-6 py-6"><div className="h-5 w-24 bg-white/5 rounded-full" /></td>
                                        <td className="px-6 py-6 flex justify-center"><div className="h-6 w-16 bg-white/5 rounded-md" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-40 bg-white/5 rounded" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-10 bg-white/5 rounded ml-auto" /></td>
                                    </tr>
                                ))
                            ) : executions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-24 text-center">
                                        <div className="bg-white/5 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                            <History className="h-8 w-8 text-slate-700" />
                                        </div>
                                        <p className="text-white font-bold text-lg">No execution records found</p>
                                        <p className="text-slate-500 max-w-xs mx-auto mt-2 font-medium">Try adjusting your filters or log a new control execution.</p>
                                    </td>
                                </tr>
                            ) : (
                                executions.map((exec) => (
                                    <motion.tr
                                        key={exec.id}
                                        variants={itemItem}
                                        className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group cursor-pointer"
                                        onClick={() => navigate(`/controls/${exec.control_id}`)}
                                    >
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-white mb-0.5">
                                                    {new Date(exec.executed_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                                                    {new Date(exec.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-white group-hover:text-accent transition-colors truncate max-w-[200px]">
                                                    {exec.control?.name || `Control #${exec.control_id}`}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                    ID: {exec.control?.id || '—'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-black text-accent">
                                                    <User className="h-3 w-3" />
                                                </div>
                                                <span className="text-xs font-bold text-slate-400">{exec.executed_by?.name || 'System Admin'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex justify-center">
                                                <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${getResultColor(exec.result)}`}>
                                                    {getResultIcon(exec.result)}
                                                    {exec.result.replace('_', ' ')}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-xs text-slate-400 font-medium line-clamp-1 italic max-w-xs">
                                                "{exec.findings || 'No findings recorded.'}"
                                            </p>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <button className="p-2 text-slate-600 group-hover:text-white transition-colors">
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
