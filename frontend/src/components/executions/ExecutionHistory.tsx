import { useState, useEffect, useCallback } from 'react';
import {
    Calendar,
    CheckCircle,
    XCircle,
    AlertTriangle,
    MinusCircle,
    User,
    ChevronDown,
    ChevronUp,
    FileText,
    History
} from 'lucide-react';
import { executionApi } from '@/services/executionApi';
import type { ControlExecution } from '@/services/executionApi';

interface ExecutionHistoryProps {
    controlId: number;
}

const RESULT_CONFIG = {
    pass: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', label: 'Passed' },
    fail: { icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/20', label: 'Failed' },
    issues_found: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', label: 'Issues Found' },
    not_applicable: { icon: MinusCircle, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/20', label: 'N/A' },
};

export function ExecutionHistory({ controlId }: ExecutionHistoryProps) {
    const [executions, setExecutions] = useState<ControlExecution[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const fetchExecutions = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await executionApi.getExecutions({ control_id: controlId });
            setExecutions(data);
            setError(null);
        } catch (err) {
            console.error('Error fetching execution history:', err);
            setError('Failed to load history');
        } finally {
            setIsLoading(false);
        }
    }, [controlId]);

    useEffect(() => {
        fetchExecutions();
    }, [fetchExecutions]);

    if (isLoading && executions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-3">
                <History className="h-8 w-8 animate-pulse text-slate-600" />
                <p className="text-sm font-medium">Loading history...</p>
            </div>
        );
    }

    if (executions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-600 border-2 border-dashed border-white/5 rounded-2xl gap-2">
                <History className="h-8 w-8 opacity-20" />
                <p className="text-sm font-medium">No execution history found</p>
                <p className="text-xs">Log an execution to start tracking performance</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {executions.map((exe) => {
                const config = RESULT_CONFIG[exe.result as keyof typeof RESULT_CONFIG] || RESULT_CONFIG.pass;
                const isExpanded = expandedId === exe.id;

                return (
                    <div
                        key={exe.id}
                        className={`glass-card !p-0 overflow-hidden transition-all duration-300 border ${isExpanded ? 'border-white/20' : 'border-transparent hover:border-white/10'}`}
                    >
                        <div
                            className="p-4 flex items-center justify-between cursor-pointer"
                            onClick={() => setExpandedId(isExpanded ? null : exe.id)}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-lg ${config.bg}`}>
                                    <config.icon className={`h-5 w-5 ${config.color}`} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`text-xs font-black uppercase tracking-widest ${config.color}`}>
                                            {config.label}
                                        </span>
                                        <span className="text-slate-600">•</span>
                                        <span className="text-xs font-bold text-white">
                                            {new Date(exe.executed_at).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                                        <div className="flex items-center gap-1">
                                            <User className="h-3 w-3" />
                                            {exe.executed_by?.name || 'Unknown'}
                                        </div>
                                        {exe.next_scheduled && (
                                            <>
                                                <span className="text-slate-700">|</span>
                                                <div className="flex items-center gap-1 text-accent">
                                                    <Calendar className="h-3 w-3" />
                                                    Next: {new Date(exe.next_scheduled).toLocaleDateString()}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                {exe.findings && !isExpanded && (
                                    <p className="text-xs text-slate-400 line-clamp-1 max-w-[200px] hidden md:block italic">
                                        "{exe.findings}"
                                    </p>
                                )}
                                <div className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 transition-colors">
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="px-14 pb-5 pt-2 border-t border-white/5 bg-white/[0.01]">
                                <div className="grid md:grid-cols-2 gap-8 mt-2">
                                    {exe.findings && (
                                        <div className="space-y-2">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Findings & Evidence</h4>
                                            <p className="text-sm text-slate-300 leading-relaxed font-medium">
                                                {exe.findings}
                                            </p>
                                            {exe.evidence_reference && (
                                                <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10 w-fit mt-3">
                                                    <FileText className="h-3.5 w-3.5 text-accent" />
                                                    <span className="text-[10px] font-bold text-slate-400 truncate max-w-[200px]">
                                                        {exe.evidence_reference}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {exe.notes && (
                                        <div className="space-y-2">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Additional Notes</h4>
                                            <p className="text-sm text-slate-400 leading-relaxed italic">
                                                {exe.notes}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
