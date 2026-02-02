import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
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
    FileText,
    Sheet,
    Shield,
    Target
} from 'lucide-react';
import { executionApi } from '@/services/executionApi';
import { reportApi } from '@/services/reportApi';
import type { ControlExecution, ExecutionResult } from '@/services/executionApi';
import { Pagination } from '@/components/tables';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

export function AuditTrailPage() {
    const { t } = useTranslation('controls');
    const navigate = useNavigate();

    const [executions, setExecutions] = useState<ControlExecution[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [resultFilter, setResultFilter] = useState<ExecutionResult | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const limit = 50;

    const fetchExecutions = useCallback(async () => {
        try {
            setIsLoading(true);
            const skip = (currentPage - 1) * limit;
            const data = await executionApi.getExecutions({
                skip,
                limit,
                result: resultFilter || undefined
            });
            // Note: executionApi.getExecutions returns array directly, not paginated response
            // In a full fix, the backend would return { items, total }
            setExecutions(data);
            // Estimate total based on whether we got a full page
            setTotalCount(data.length < limit ? skip + data.length : skip + limit + 1);
        } catch (err) {
            console.error('Failed to fetch audit trail:', err);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, resultFilter]);

    // Reset page when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [resultFilter]);

    useEffect(() => {
        fetchExecutions();
    }, [fetchExecutions]);

    const getResultIcon = (result: ExecutionResult) => {
        switch (result) {
            case 'passed': return <CheckCircle className="h-4 w-4 text-emerald-400" />;
            case 'failed': return <XCircle className="h-4 w-4 text-rose-400" />;
            case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-400" />;
            case 'not_applicable': return <MinusCircle className="h-4 w-4 text-slate-400" />;
        }
    };

    const getResultColor = (result: ExecutionResult) => {
        switch (result) {
            case 'passed': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'failed': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
            case 'warning': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            case 'not_applicable': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('audit_trail.title', 'Audit Trail')}</h2>
                    <p className="text-slate-500 font-medium">{t('audit_trail.subtitle', 'Global log of all control executions and compliance checks.')}</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                        <button
                            onClick={() => reportApi.downloadAuditTrailPdf({ result: resultFilter || undefined }).catch(console.error)}
                            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all bg-white/5 rounded-lg border border-white/5 flex items-center gap-2 hover:bg-accent/10 hover:border-accent/20"
                        >
                            <FileText className="h-3.5 w-3.5" />
                            PDF
                        </button>
                        <button
                            onClick={() => reportApi.downloadAuditTrailExcel({ result: resultFilter || undefined }).catch(console.error)}
                            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all flex items-center gap-2 hover:bg-accent/10 rounded-lg"
                        >
                            <Sheet className="h-3.5 w-3.5" />
                            Excel
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 glass-card flex items-center gap-4 !py-3">
                    <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10 group focus-within:border-accent/50 transition-all flex-1">
                        <Filter className="h-4 w-4 text-slate-500 group-focus-within:text-accent" />
                        <ThemedSelect
                            value={resultFilter}
                            onValueChange={(v) => setResultFilter(v as ExecutionResult | '')}
                            placeholder={t('audit_trail.all_results', 'All Results')}
                            allowEmpty
                            emptyLabel={t('audit_trail.all_results', 'All Results')}
                            className="flex-1"
                            options={[
                                { value: 'passed', label: t('results.passed', 'Passed') },
                                { value: 'failed', label: t('results.failed', 'Failed') },
                                { value: 'warning', label: t('results.warning', 'Warning') },
                                { value: 'not_applicable', label: t('results.not_applicable', 'N/A') },
                            ]}
                        />
                    </div>

                    <div className="h-8 w-px bg-white/10 hidden md:block" />

                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 px-4">
                        <ClipboardCheck className="h-4 w-4" />
                        {t('audit_trail.total_records', '{{count}} Total Records', { count: executions.length })}
                    </div>
                </div>
            </div>

            <div className="glass-card !p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.date_time', 'Date/Time')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.control', 'Control')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.owner', 'Owner')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.risk', 'Risk')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.executor', 'Executor')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">{t('audit_trail.columns.result', 'Result')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.key_finding', 'Key Finding')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">{t('audit_trail.columns.action', 'Action')}</th>
                            </tr>
                        </thead>
                        <tbody
                            key={resultFilter}
                        >
                            {isLoading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={`skeleton-${i}`} className="border-b border-white/5 animate-pulse">
                                        <td className="px-6 py-6"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-48 bg-white/5 rounded" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                                        <td className="px-6 py-6"><div className="h-5 w-24 bg-white/5 rounded-full" /></td>
                                        <td className="px-6 py-6 flex justify-center"><div className="h-6 w-16 bg-white/5 rounded-md" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-40 bg-white/5 rounded" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-10 bg-white/5 rounded ml-auto" /></td>
                                    </tr>
                                ))
                            ) : executions.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-24 text-center">
                                        <div className="bg-white/5 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                            <History className="h-8 w-8 text-slate-700" />
                                        </div>
                                        <p className="text-white font-bold text-lg">No execution records found</p>
                                        <p className="text-slate-500 max-w-xs mx-auto mt-2 font-medium">Try adjusting your filters or log a new control execution.</p>
                                    </td>
                                </tr>
                            ) : (
                                executions.map((exec) => (
                                    <tr
                                        key={exec.id}
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
                                                    {exec.control_name || exec.control?.name || `Control #${exec.control_id}`}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <Shield className="h-3 w-3 text-slate-500" />
                                                <span className="text-xs font-bold text-slate-400">{exec.control_owner_name || 'Unassigned'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col gap-1">
                                                {exec.linked_risks && exec.linked_risks.length > 0 ? (
                                                    exec.linked_risks.map((risk, i) => (
                                                        <div key={i} className="flex items-center gap-1.5">
                                                            <Target className="h-3 w-3 text-rose-500/70" />
                                                            <span className="text-xs font-medium text-slate-400">{risk}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-slate-600 italic">No linked risks</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-black text-accent">
                                                    <User className="h-3 w-3" />
                                                </div>
                                                <span className="text-xs font-bold text-slate-400">{exec.executed_by_name || exec.executed_by?.name || 'System Admin'}</span>
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
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / limit) || 1}
                totalItems={totalCount}
                itemsPerPage={limit}
                onPageChange={setCurrentPage}
            />
        </div>
    );
}
