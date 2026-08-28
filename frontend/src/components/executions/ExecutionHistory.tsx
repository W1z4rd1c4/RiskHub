import { useState, useEffect, useCallback } from 'react';
import {
    Calendar,
    User,
    ChevronDown,
    ChevronUp,
    FileText,
    History,
    AlertTriangle,
    PlusCircle
} from 'lucide-react';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { controlApi } from '@/services/controlApi';
import type { ControlExecution } from '@/types/execution';
import type { Issue } from '@/types/issue';
import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue, formatDateValue } from '@/i18n/formatters';
import { getExecutionResultMeta } from '@/lib/executionResult';
import { logError } from '@/services/logger';

interface ExecutionHistoryProps {
    controlId: number;
    controlName?: string;
    canCreateIssue?: boolean;
    createIssueLabel?: string;
    onIssueCreated?: (issue: Issue) => void;
}

export function ExecutionHistory({
    controlId,
    controlName,
    canCreateIssue = false,
    createIssueLabel,
    onIssueCreated,
}: ExecutionHistoryProps) {
    const { t, i18n } = useTranslation(['controls', 'common', 'issues']);
    const [executions, setExecutions] = useState<ControlExecution[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoadError, setHasLoadError] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [issueExecution, setIssueExecution] = useState<ControlExecution | null>(null);

    const fetchExecutions = useCallback(async () => {
        try {
            setIsLoading(true);
            setHasLoadError(false);
            const data = await controlApi.getExecutions(controlId);
            setExecutions(data);
        } catch (err) {
            logError('Error fetching execution history:', err);
            setHasLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [controlId]);

    useEffect(() => {
        void fetchExecutions();
    }, [fetchExecutions]);

    if (isLoading && executions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-3">
                <History className="h-8 w-8 animate-pulse text-slate-600" />
                <p className="text-sm font-medium">{t('loading.history', { ns: 'common' })}</p>
            </div>
        );
    }

    if (hasLoadError) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-rose-200 border-2 border-dashed border-rose-500/20 rounded-2xl gap-3">
                <AlertTriangle className="h-8 w-8 text-rose-400" />
                <p className="text-sm font-medium">{t('errors.load_history_failed', { ns: 'controls' })}</p>
                <button
                    type="button"
                    onClick={() => void fetchExecutions()}
                    className="px-4 py-2 rounded-xl border border-rose-400/20 bg-rose-400/10 text-xs font-black uppercase tracking-widest text-rose-100 hover:bg-rose-400/20 transition-colors"
                >
                    {t('errors.try_again', { ns: 'controls' })}
                </button>
            </div>
        );
    }

    if (executions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-600 border-2 border-dashed border-white/5 rounded-2xl gap-2">
                <History className="h-8 w-8 opacity-20" />
                <p className="text-sm font-medium">{t('empty_state.no_executions', { ns: 'controls' })}</p>
                <p className="text-xs">{t('executions.log_to_start')}</p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-4">
                {executions.map((exe) => {
                    const config = getExecutionResultMeta(exe.result);
                    const isExpanded = expandedId === exe.id;
                    const ResultIcon = config.icon;
                    const canCreateExecutionIssue = canCreateIssue && (exe.result === 'failed' || exe.result === 'warning');

                    return (
                        <div
                            key={exe.id}
                            className={`glass-card !p-0 overflow-hidden border ${isExpanded ? 'border-border' : 'border-transparent'}`}
                        >
                            <div className="p-4 flex items-center gap-4">
                                <button
                                    type="button"
                                    aria-expanded={isExpanded}
                                    aria-controls={`execution-details-${exe.id}`}
                                    className="flex flex-1 min-w-0 items-center justify-between gap-4 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => setExpandedId(isExpanded ? null : exe.id)}
                                >
                                    <span className="flex items-center gap-4 min-w-0">
                                        <span className={`p-2 rounded-lg border ${config.badgeClassName}`}>
                                            <ResultIcon className={`h-5 w-5 ${config.iconClassName}`} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-2 mb-0.5">
                                                <span className={`text-xs font-black uppercase tracking-widest ${config.iconClassName}`}>
                                                    {t(config.labelKey)}
                                                </span>
                                                <span className="text-slate-600">•</span>
                                                <span className="text-xs font-bold text-white">
                                                    {formatDateTimeValue(exe.executed_at, i18n.language)}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                                                <span className="flex items-center gap-1">
                                                    <User className="h-3 w-3" />
                                                    {exe.executed_by?.name || t('labels.unknown', { ns: 'common' })}
                                                </span>
                                                {exe.next_scheduled && (
                                                    <>
                                                        <span className="text-slate-700">|</span>
                                                        <span className="flex items-center gap-1 text-accent-text">
                                                            <Calendar className="h-3 w-3" />
                                                            {t('executions.next')}: {formatDateValue(exe.next_scheduled, i18n.language)}
                                                        </span>
                                                    </>
                                                )}
                                            </span>
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-4 min-w-0">
                                        {exe.findings && !isExpanded && (
                                            <span className="text-xs text-slate-400 line-clamp-1 max-w-[200px] hidden md:block italic">
                                                "{exe.findings}"
                                            </span>
                                        )}
                                        <span className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 transition-colors">
                                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                        </span>
                                    </span>
                                </button>
                                {canCreateExecutionIssue && (
                                    <button
                                        type="button"
                                        onClick={() => setIssueExecution(exe)}
                                        className="shrink-0 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-black uppercase tracking-widest text-foreground hover:border-accent/50 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <PlusCircle className="h-3 w-3" />
                                            {createIssueLabel ?? t('actions.new_issue', { ns: 'issues' })}
                                        </span>
                                    </button>
                                )}
                            </div>

                            {isExpanded && (
                                <div id={`execution-details-${exe.id}`} className="px-14 pb-5 pt-2 border-t border-white/5 bg-white/[0.01]">
                                    <div className="grid md:grid-cols-2 gap-8 mt-2">
                                        {exe.findings && (
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t('executions.findings_evidence')}</h4>
                                                <p className="text-sm text-slate-300 leading-relaxed font-medium">
                                                    {exe.findings}
                                                </p>
                                                {exe.evidence_reference && (
                                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10 w-fit mt-3">
                                                        <FileText className="h-3.5 w-3.5 text-accent" />
                                                        <span className="text-xs font-bold text-muted-foreground truncate max-w-[200px]">
                                                            {exe.evidence_reference}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {exe.notes && (
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{t('executions.additional_notes')}</h4>
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
            <IssueQuickCreateModal
                isOpen={issueExecution !== null}
                onClose={() => setIssueExecution(null)}
                contextEntityType="execution"
                contextEntityId={issueExecution?.id ?? 0}
                contextEntityLabel={controlName ?? (issueExecution ? formatDateTimeValue(issueExecution.executed_at, i18n.language) : '')}
                onCreated={(issue) => {
                    onIssueCreated?.(issue);
                    setIssueExecution(null);
                }}
            />
        </>
    );
}
