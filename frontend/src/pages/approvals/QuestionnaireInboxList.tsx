import { motion } from 'framer-motion';
import { CheckCircle2, Clock } from 'lucide-react';

import type { SafeTFunction } from '@/i18n/hooks';
import { formatDateValue } from '@/i18n/formatters';
import { cn } from '@/lib/utils';
import type { CollectionOutcome } from '@/pages/shared/collectionPageState';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import { getQuestionnaireStatusBadge, getQuestionnaireStatusLabel } from './approvalsPresentation';

interface QuestionnaireInboxListProps {
    questionnaires: RiskQuestionnaireListItem[];
    outcome: CollectionOutcome;
    locale?: string;
    onOpenRisk: (riskId: number) => void;
    onRetry: () => void;
    t: SafeTFunction;
}

export function QuestionnaireInboxList({
    questionnaires,
    outcome,
    locale = 'en',
    onOpenRisk,
    onRetry,
    t,
}: QuestionnaireInboxListProps) {
    if (outcome.kind === 'initial-loading') {
        return (
            <div className="flex items-center justify-center py-20" role="status">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="sr-only">{t('common:loading.generic')}</span>
            </div>
        );
    }

    if (outcome.kind === 'denied') {
        return (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {t('approvals:errors.questionnaire_access_denied')}
            </div>
        );
    }

    const hasStaleData = outcome.kind === 'stale-with-error';
    let loadError: string | null = null;
    if (outcome.kind === 'fatal-error') {
        loadError = t('approvals:errors.questionnaire_load_failed');
    } else if (outcome.kind === 'stale-with-error') {
        loadError = t('approvals:errors.questionnaire_stale');
    }
    const retrying = outcome.kind === 'fatal-error' || hasStaleData
        ? outcome.isRetrying
        : false;

    if (outcome.kind === 'empty') {
        return (
            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                <CheckCircle2 className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">{t('empty_state.all_caught_up')}</h3>
                <p className="text-slate-500 max-w-sm mx-auto">{t('empty_state.no_questionnaires')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {loadError && (
                <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    <span>{loadError}</span>
                    <button
                        type="button"
                        onClick={onRetry}
                        aria-busy={retrying}
                        aria-disabled={retrying}
                        className="ml-auto rounded-lg border border-current px-3 py-2 font-medium"
                    >
                        {t('common:actions.retry')}
                    </button>
                    {retrying && <span role="status" className="sr-only">{t('approvals:status.questionnaire_retrying')}</span>}
                </div>
            )}
            {(outcome.kind === 'content' || hasStaleData) && questionnaires.map((questionnaire) => (
                <motion.div
                    key={questionnaire.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card p-0 overflow-hidden"
                >
                    <div className="p-6 flex flex-col lg:flex-row lg:items-center gap-6">
                        <div className="flex flex-col gap-2 min-w-[140px]">
                            <span
                                className={cn(
                                    'px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border w-fit',
                                    getQuestionnaireStatusBadge(questionnaire),
                                )}
                            >
                                {getQuestionnaireStatusLabel(questionnaire, t)}
                            </span>
                            <div className="text-xs text-slate-500">
                                {t('risks:questionnaire.meta.due')} {formatDateValue(questionnaire.due_at, locale)}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-white mb-1 truncate">
                                {questionnaire.risk_name ?? t('common:fallbacks.unknown_risk')}
                            </h3>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {t('risks:questionnaire.meta.sent')} {formatDateValue(questionnaire.sent_at, locale)}
                                </span>
                                <span>
                                    by{' '}
                                    <span className="text-accent">
                                        {questionnaire.sent_by_user_name ?? t('common:fallbacks.unknown_user')}
                                    </span>
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onOpenRisk(questionnaire.risk_id)}
                                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-all text-sm"
                            >
                                {t('risks:questionnaires.open')}
                            </button>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
