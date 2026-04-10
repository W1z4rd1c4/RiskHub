import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import {
    ClipboardCheck,
    Filter,
    ChevronRight,
    User,
    History,
    Sheet,
    Shield,
    Target
} from 'lucide-react';
import { executionApi } from '@/services/executionApi';
import { reportApi } from '@/services/reportApi';
import type { ExecutionAuditItem, ExecutionResult } from '@/types/execution';
import { Pagination } from '@/components/tables';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { formatDateValue, formatTimeValue } from '@/i18n/formatters';
import { getExecutionResultMeta } from '@/lib/executionResult';

const AUDIT_TRAIL_SKELETON_ROWS = 5;

export function AuditTrailPage() {
    const { t, i18n } = useTranslation(['controls', 'common']);
    const navigate = useNavigate();

    const [executions, setExecutions] = useState<ExecutionAuditItem[]>([]);
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
            setExecutions(data.items);
            setTotalCount(data.total);
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
        void fetchExecutions();
    }, [fetchExecutions]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('audit_trail.title')}</h2>
                    <p className="text-slate-500 font-medium">{t('audit_trail.subtitle')}</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => reportApi.downloadAuditTrailCsv({ result: resultFilter || undefined }).catch(console.error)}
                        className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all bg-white/5 rounded-lg border border-white/10 flex items-center gap-2 hover:bg-accent/10 hover:border-accent/20"
                    >
                        <Sheet className="h-3.5 w-3.5" />
                        CSV
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 glass-card flex items-center gap-4 !py-3">
                    <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10 group focus-within:border-accent/50 transition-all flex-1">
                        <Filter className="h-4 w-4 text-slate-500 group-focus-within:text-accent" />
                        <ThemedSelect
                            value={resultFilter}
                            onValueChange={(v) => setResultFilter(v as ExecutionResult | '')}
                            placeholder={t('audit_trail.all_results')}
                            allowEmpty
                            emptyLabel={t('audit_trail.all_results')}
                            className="flex-1"
                            options={[
                                { value: 'passed', label: t('results.passed') },
                                { value: 'failed', label: t('results.failed') },
                                { value: 'warning', label: t('results.warning') },
                                { value: 'not_applicable', label: t('results.not_applicable') },
                            ]}
                        />
                    </div>

                    <div className="h-8 w-px bg-white/10 hidden md:block" />

                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 px-4">
                        <ClipboardCheck className="h-4 w-4" />
                        {t('audit_trail.total_records', { count: totalCount })}
                    </div>
                </div>
            </div>

            <div className="glass-card !p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.date_time')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.control')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.owner')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.risk')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.executor')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">{t('audit_trail.columns.result')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('audit_trail.columns.key_finding')}</th>
                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">{t('audit_trail.columns.action')}</th>
                            </tr>
                        </thead>
                        <tbody
                            key={resultFilter}
                        >
                            {isLoading ? (
                                Array.from({ length: AUDIT_TRAIL_SKELETON_ROWS }, (_, i) => (
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
                                        <p className="text-white font-bold text-lg">{t('common:empty.no_executions')}</p>
                                        <p className="text-slate-500 max-w-xs mx-auto mt-2 font-medium">{t('audit_trail.no_records_help')}</p>
                                    </td>
                                </tr>
                            ) : (
                                executions.map((exec) => {
                                    const resultMeta = getExecutionResultMeta(exec.result);
                                    const ResultIcon = resultMeta.icon;
                                    return (
                                        <tr
                                            key={exec.id}
                                            className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group cursor-pointer"
                                            onClick={() => navigate(`/controls/${exec.control_id}`)}
                                        >
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-white mb-0.5">
                                                        {formatDateValue(exec.executed_at, i18n.language)}
                                                    </span>
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                                                        {formatTimeValue(exec.executed_at, i18n.language)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-white group-hover:text-accent transition-colors truncate max-w-[200px]">
                                                        {exec.control_name || exec.control?.name || t('common:fallbacks.unknown_control')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2">
                                                    <Shield className="h-3 w-3 text-slate-500" />
                                                    <span className="text-xs font-bold text-slate-400">{exec.control_owner_name || t('common:fallbacks.unassigned')}</span>
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
                                                        <span className="text-xs text-slate-600 italic">{t('common:empty.no_linked_risks')}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-black text-accent">
                                                        <User className="h-3 w-3" />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-400">{exec.executed_by_name || exec.executed_by?.name || t('common:fallbacks.system')}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex justify-center">
                                                    <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${resultMeta.badgeClassName}`}>
                                                        <ResultIcon className={`h-4 w-4 ${resultMeta.iconClassName}`} />
                                                        {t(resultMeta.labelKey)}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className="text-xs text-slate-400 font-medium line-clamp-1 italic max-w-xs">
                                                    "{exec.findings || t('audit_trail.no_findings')}"
                                                </p>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button className="p-2 text-slate-600 group-hover:text-white transition-colors">
                                                    <ChevronRight className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
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

export default AuditTrailPage;
